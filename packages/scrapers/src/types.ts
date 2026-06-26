export interface ScrapeResult {
  vendorId: string;
  testId: string;
  offeringId: string;
  scrapedPrice: number;
  currency: string;
  sourceUrl: string;
  scrapedAt: Date;
  rawHtml?: string;
  screenshotPath?: string;
}

export interface ScrapeError {
  vendorId: string;
  testId: string;
  errorType: 'TIMEOUT' | 'BLOCKED' | 'SELECTOR_MISSING' | 'PARSE_ERROR' | 'NETWORK' | 'UNKNOWN';
  message: string;
  retryable: boolean;
  screenshotPath?: string;
}

export interface VendorConfig {
  vendorId: string;
  vendorSlug: string;
  engine: 'playwright' | 'http';
  baseUrl: string;
  rateLimit: { maxConcurrent: number; delayMs: number };
  selectors: {
    priceSelector: string;
    nameSelector?: string;
    containerSelector?: string;
  };
  headers?: Record<string, string>;
  testUrls: Record<string, string>; // testId -> URL path
}

export interface IScrapeEngine {
  name: string;
  scrape(config: VendorConfig, testId: string): Promise<ScrapeResult | ScrapeError>;
  cleanup(): Promise<void>;
}
