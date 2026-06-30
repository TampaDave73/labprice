import * as cheerio from 'cheerio';
import type { IScrapeEngine, VendorConfig, ScrapeResult, ScrapeError } from '../types';

export interface HttpEngineOptions {
  timeoutMs?: number;
}

export class HttpEngine implements IScrapeEngine {
  readonly name = 'http';
  /** Set to true after a scrape if the result looks like it needs a browser. */
  public shouldRetryWithBrowser = false;

  private readonly timeoutMs: number;

  constructor(options: HttpEngineOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async scrape(config: VendorConfig, testId: string): Promise<ScrapeResult | ScrapeError> {
    this.shouldRetryWithBrowser = false;

    const urlPath = config.testUrls[testId];
    if (!urlPath) {
      return this.makeError(config, testId, 'PARSE_ERROR', `No URL configured for testId: ${testId}`, false);
    }

    const sourceUrl = `${config.baseUrl}${urlPath}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LabTestCompareBot/1.0)',
          'Accept': 'text/html,application/json',
          ...config.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 403 || response.status === 429) {
        this.shouldRetryWithBrowser = true;
        return this.makeError(config, testId, 'BLOCKED', `HTTP ${response.status}`, true);
      }

      if (!response.ok) {
        return this.makeError(config, testId, 'NETWORK', `HTTP ${response.status}`, true);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.text();

      // Detect JS-rendered pages — flag for browser retry
      if (contentType.includes('text/html') && body.includes('__NEXT_DATA__') && !body.includes(config.selectors.priceSelector.replace(/[.#[\]]/g, ''))) {
        this.shouldRetryWithBrowser = true;
        return this.makeError(config, testId, 'SELECTOR_MISSING', 'Page appears to be JS-rendered', true);
      }

      // JSON API response
      if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(body);
          const price = this.extractPriceFromJson(json);
          if (price !== null) {
            return {
              vendorId: config.vendorId,
              testId,
              offeringId: `${config.vendorId}:${testId}`,
              scrapedPrice: price,
              currency: 'USD',
              sourceUrl,
              scrapedAt: new Date(),
            };
          }
        } catch {
          // fall through to HTML parsing
        }
      }

      // HTML parsing with cheerio
      const $ = cheerio.load(body);
      const priceEl = $(config.selectors.priceSelector);

      if (priceEl.length === 0) {
        this.shouldRetryWithBrowser = true;
        return this.makeError(config, testId, 'SELECTOR_MISSING', `Selector not found: ${config.selectors.priceSelector}`, true);
      }

      const priceText = priceEl.first().text().trim();
      if (!priceText) {
        return this.makeError(config, testId, 'PARSE_ERROR', 'Price element found but empty', false);
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
        rawHtml: priceEl.first().html() ?? undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorType: ScrapeError['errorType'] = message.includes('abort') ? 'TIMEOUT' : 'NETWORK';
      return this.makeError(config, testId, errorType, message, true);
    }
  }

  async cleanup(): Promise<void> {
    // No resources to clean up for HTTP engine
  }

  private extractPriceFromJson(json: unknown): number | null {
    if (typeof json === 'object' && json !== null) {
      const obj = json as Record<string, unknown>;
      for (const key of ['price', 'amount', 'cost', 'sale_price', 'current_price']) {
        if (typeof obj[key] === 'number') return obj[key] as number;
        if (typeof obj[key] === 'string') {
          const parsed = parseFloat(String(obj[key]).replace(/[$,]/g, ''));
          if (!isNaN(parsed)) return parsed;
        }
      }
    }
    return null;
  }

  private makeError(
    config: VendorConfig,
    testId: string,
    errorType: ScrapeError['errorType'],
    message: string,
    retryable: boolean,
  ): ScrapeError {
    return { vendorId: config.vendorId, testId, errorType, message, retryable };
  }
}
