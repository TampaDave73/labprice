import type { VendorConfig } from '../types';

export const ultaLabTestsConfig: VendorConfig = {
  vendorId: 'vendor_ulta_lab_tests',
  vendorSlug: 'ulta-lab-tests',
  engine: 'http',
  baseUrl: 'https://www.ultalabtests.com',
  rateLimit: { maxConcurrent: 3, delayMs: 2000 },
  selectors: {
    priceSelector: '.test-price, .price-value',
    nameSelector: '.test-title, h1.test-name',
    containerSelector: '.test-detail-container',
  },
  headers: {
    'Accept-Language': 'en-US,en;q=0.9',
  },
  testUrls: {
    'cbc': '/tests/complete-blood-count',
    'cmp': '/tests/comprehensive-metabolic-panel',
    'lipid-panel': '/tests/lipid-panel',
    'thyroid-panel': '/tests/thyroid-panel',
  },
};
