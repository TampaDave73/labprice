// Types
export type {
  ScrapeResult,
  ScrapeError,
  VendorConfig,
  IScrapeEngine,
} from './types';

// Engines
export { PlaywrightEngine } from './engines/playwright-engine';
export type { PlaywrightEngineOptions } from './engines/playwright-engine';
export { HttpEngine } from './engines/http-engine';
export type { HttpEngineOptions } from './engines/http-engine';

// Core modules
export { ProxyManager } from './proxy-manager';
export { normalizePrice, detectChange, shouldAutoApprove } from './normalizer';
export type { PriceChange, ApprovalDecision } from './normalizer';
export { publishPriceChange } from './publisher';

// Vendor configs
export { lifeExtensionConfig } from './configs/life-extension';
export { ultaLabTestsConfig } from './configs/ulta-lab-tests';
