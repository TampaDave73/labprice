import type { VendorConfig } from '../types';

export const lifeExtensionConfig: VendorConfig = {
  vendorId: 'vendor_life_extension',
  vendorSlug: 'life-extension',
  engine: 'playwright',
  baseUrl: 'https://www.lifeextension.com',
  rateLimit: { maxConcurrent: 2, delayMs: 3000 },
  selectors: {
    priceSelector: '[data-testid="product-price"], .product-price .price',
    nameSelector: 'h1.product-name, [data-testid="product-name"]',
    containerSelector: '.product-detail',
  },
  testUrls: {
    'cbc': '/lab-testing/itemize/blood-tests/cbc',
    'cmp': '/lab-testing/itemize/blood-tests/comprehensive-metabolic-panel',
    'lipid-panel': '/lab-testing/itemize/blood-tests/lipid-panel',
    'thyroid-panel': '/lab-testing/itemize/blood-tests/thyroid-panel',
  },
};
