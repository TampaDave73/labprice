// Live smoke test: crawl the real GoodLabs catalog and match our seed tests against it.
// Run: npx tsx scripts/run-goodlabs-live.ts   (from packages/scrapers)
// No DB — just proves the crawl + parse + match pipeline works end-to-end on the live site.
import { discover, httpFetchHtml } from '../src/catalog/catalog-scraper';
import { goodlabsCatalogConfig } from '../src/configs/goodlabs';
import type { TestKey } from '../src/catalog/types';

const seedTests: TestKey[] = [
  { id: '1', name: 'Ferritin', questCode: '457', labcorpCode: '004598' },
  { id: '2', name: 'Comprehensive Metabolic Panel', questCode: '10231', labcorpCode: '322000' },
  { id: '3', name: 'CBC (Complete Blood Count)', questCode: '6399', labcorpCode: '005009' },
  { id: '4', name: 'Lipid Panel', questCode: '7600', labcorpCode: '303756' },
  { id: '5', name: 'HbA1c (Hemoglobin A1c)', questCode: '496', labcorpCode: '001453' },
  { id: '6', name: 'Testosterone Total', questCode: '873', labcorpCode: '004226' },
  { id: '7', name: 'TSH (Thyroid Stimulating Hormone)', questCode: '867', labcorpCode: '004259' },
  { id: '8', name: 'Vitamin D 25-Hydroxy', questCode: '17306', labcorpCode: '081950' },
  { id: '9', name: 'PSA (Prostate-Specific Antigen)', questCode: '34', labcorpCode: '070234' },
];

async function main() {
  const { products, matches } = await discover(
    seedTests,
    { fetchHtml: httpFetchHtml(), onLog: (m) => console.log('·', m) },
    goodlabsCatalogConfig,
  );

  console.log(`\n=== ${products.length} products indexed. Matches: ===\n`);
  for (const { test, result } of matches) {
    const tag = result.status.toUpperCase().padEnd(9);
    console.log(`${tag} ${test.name}`);
    console.log(`          ${result.reason}`);
    if (result.status === 'ambiguous') {
      for (const c of result.candidates)
        console.log(
          `            · ${c.productName} [${c.labProvider}] ${c.price != null ? '$' + c.price : '—'}${c.isPanel ? ' (panel)' : ''}`,
        );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
