import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { IScrapeEngine, VendorConfig, ScrapeResult, ScrapeError } from '../types';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
];

export interface PlaywrightEngineOptions {
  timeoutMs?: number;
  screenshotDir?: string;
  viewport?: { width: number; height: number };
  headless?: boolean;
}

export class PlaywrightEngine implements IScrapeEngine {
  readonly name = 'playwright';
  private browser: Browser | null = null;
  private readonly options: Required<PlaywrightEngineOptions>;

  constructor(options: PlaywrightEngineOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 30_000,
      screenshotDir: options.screenshotDir ?? '/tmp/labprice-screenshots',
      viewport: options.viewport ?? { width: 1280, height: 720 },
      headless: options.headless ?? true,
    };
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: this.options.headless });
    }
    return this.browser;
  }

  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
  }

  async scrape(config: VendorConfig, testId: string): Promise<ScrapeResult | ScrapeError> {
    const urlPath = config.testUrls[testId];
    if (!urlPath) {
      return this.makeError(config, testId, 'PARSE_ERROR', `No URL configured for testId: ${testId}`, false);
    }

    const sourceUrl = `${config.baseUrl}${urlPath}`;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({
        userAgent: this.getRandomUserAgent(),
        viewport: this.options.viewport,
        ...(config.headers ? { extraHTTPHeaders: config.headers } : {}),
      });
      page = await context.newPage();
      page.setDefaultTimeout(this.options.timeoutMs);

      const response = await page.goto(sourceUrl, { waitUntil: 'domcontentloaded' });

      if (!response) {
        return this.makeError(config, testId, 'NETWORK', 'No response received', true);
      }

      if (response.status() === 403 || response.status() === 429) {
        const screenshotPath = await this.takeScreenshot(page, config, testId);
        return this.makeError(config, testId, 'BLOCKED', `HTTP ${response.status()}`, true, screenshotPath);
      }

      if (!response.ok()) {
        return this.makeError(config, testId, 'NETWORK', `HTTP ${response.status()}`, true);
      }

      // Wait for price selector
      try {
        await page.waitForSelector(config.selectors.priceSelector, { timeout: this.options.timeoutMs });
      } catch {
        const screenshotPath = await this.takeScreenshot(page, config, testId);
        return this.makeError(config, testId, 'SELECTOR_MISSING', `Selector not found: ${config.selectors.priceSelector}`, false, screenshotPath);
      }

      const priceText = await page.textContent(config.selectors.priceSelector);
      if (!priceText) {
        const screenshotPath = await this.takeScreenshot(page, config, testId);
        return this.makeError(config, testId, 'PARSE_ERROR', 'Price element found but empty', false, screenshotPath);
      }

      const { normalizePrice } = await import('../normalizer');
      const scrapedPrice = normalizePrice(priceText);

      return {
        vendorId: config.vendorId,
        testId,
        offeringId: `${config.vendorId}:${testId}`,
        scrapedPrice,
        currency: 'USD',
        sourceUrl,
        scrapedAt: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let errorType: ScrapeError['errorType'] = 'UNKNOWN';

      if (message.includes('Timeout') || message.includes('timeout')) {
        errorType = 'TIMEOUT';
      } else if (message.includes('net::') || message.includes('ECONNREFUSED')) {
        errorType = 'NETWORK';
      }

      let screenshotPath: string | undefined;
      if (page) {
        screenshotPath = await this.takeScreenshot(page, config, testId).catch(() => undefined);
      }

      return this.makeError(config, testId, errorType, message, errorType !== 'UNKNOWN', screenshotPath);
    } finally {
      await context?.close();
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async takeScreenshot(page: Page, config: VendorConfig, testId: string): Promise<string> {
    const filename = `${config.vendorSlug}-${testId}-${Date.now()}.png`;
    const path = `${this.options.screenshotDir}/${filename}`;
    await page.screenshot({ path, fullPage: false });
    return path;
  }

  private makeError(
    config: VendorConfig,
    testId: string,
    errorType: ScrapeError['errorType'],
    message: string,
    retryable: boolean,
    screenshotPath?: string,
  ): ScrapeError {
    return { vendorId: config.vendorId, testId, errorType, message, retryable, screenshotPath };
  }
}
