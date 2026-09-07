// Moved into @labprice/scrapers so the worker can import it too (the auto-list script in
// scripts/autolist-code-matches.ts must do EXACTLY what the admin "list" action does). Re-exported
// here so existing app imports keep their short path — do not add logic to this file.
export {
  attachProductsToTest,
  clusterKey,
  computeConfidence,
  createPromotedTest,
  type Confidence,
} from '@labprice/scrapers/src/catalog/discovered-actions';
