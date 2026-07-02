// Catalog-discovery persistence now lives in @labprice/scrapers so the web app can run it inline
// (see packages/scrapers/src/catalog/persist.ts). Re-exported here for the worker + standalone
// scripts that import from '../src/discovery'.
export {
  runVendorDiscovery,
  publishStagedChange,
  type DiscoveryOptions,
  type DiscoverySummary,
} from '@labprice/scrapers/src/catalog/persist';
