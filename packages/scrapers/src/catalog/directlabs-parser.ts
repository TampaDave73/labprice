// DirectLabs (directlabs.com) is an API vendor. The marketing site (directlabs.com) is WordPress and
// irrelevant to pricing; the actual store is an Angular SPA on `store.directlabs.com` that loads its
// catalog from a clean JSON REST API — no browser needed, plain HTTP works for the API even though the
// SPA shell itself wouldn't render without JS.
//
// There's no "list every test" endpoint — `GetTestsByCategoryID` is scoped per category (46 active
// categories, fetched once from `GetCategoriesActiveByLocale` and hardcoded below since they change
// rarely; `categoryID=0` alone returns only a handful of "test of the month" specials, not everything).
// We fetch all 46 and merge by `PK_TestID`, since some tests appear in more than one category.
//
// No lab order code anywhere in the API response (checked live across multiple categories) — matching
// is name-only, like MitoHealth/Private MD Labs.
import type { CatalogProduct, ProviderOffering } from './types';

export const DIRECTLABS_DEFAULT_API_BASE = 'https://store.directlabs.com';

// Captured live from GetCategoriesActiveByLocale — see the module comment for why this is hardcoded.
export const DIRECTLABS_CATEGORY_IDS = [
  125, 102, 77, 126, 78, 127, 79, 80, 110, 119, 129, 81, 82, 131, 142, 83, 122, 31, 111, 106, 84, 32,
  136, 87, 133, 134, 104, 121, 105, 109, 90, 132, 135, 114, 97, 99, 116, 143, 89, 93, 94, 130, 107, 95,
  96, 140,
];

interface DirectLabsTest {
  PK_TestID: number;
  TestName: string;
  DL_Price?: number;
  IsQuestTest?: boolean;
  PerformingLab?: string;
}

/** Merge per-category catalog JSON into products keyed by PK_TestID (some tests span categories). */
export function mergeDirectLabsCatalog(categoryResponses: DirectLabsTest[][], baseUrl = 'https://store.directlabs.com'): CatalogProduct[] {
  const byId = new Map<number, CatalogProduct>();
  for (const tests of categoryResponses) {
    for (const t of tests) {
      if (t?.PK_TestID == null || !t.TestName || byId.has(t.PK_TestID)) continue;
      const provider: ProviderOffering = {
        labProvider: t.IsQuestTest ? 'quest' : 'other', // no order code exposed at all — provider label is informational only.
        labTestIDs: [],
        price: typeof t.DL_Price === 'number' ? t.DL_Price : null,
        isPanel: false, // no reliable bundle signal in the API; relies on the matcher's name-token safeguards.
        name: t.TestName,
      };
      byId.set(t.PK_TestID, { slug: String(t.PK_TestID), name: t.TestName, url: `${baseUrl}/testinfo/${t.PK_TestID}`, providers: [provider] });
    }
  }
  return [...byId.values()];
}

/** Fetch every category's tests and merge. Uses the injected fetcher (plain HTTP — the API itself isn't gated). */
export async function fetchDirectLabsCatalog(
  deps: { fetchHtml: (url: string) => Promise<string>; onLog?: (m: string) => void },
  cfg: { baseUrl: string; apiBase?: string },
): Promise<CatalogProduct[]> {
  const apiBase = cfg.apiBase ?? DIRECTLABS_DEFAULT_API_BASE;
  const responses: DirectLabsTest[][] = [];
  for (const categoryID of DIRECTLABS_CATEGORY_IDS) {
    const url = `${apiBase}/api/LabTests/GetTestsByCategoryID?categoryID=${categoryID}&searchString=&userID=0&locale=en-US&alphaValue=`;
    try {
      const txt = await deps.fetchHtml(url);
      responses.push(JSON.parse(txt));
    } catch {
      deps.onLog?.(`  ! bad response for categoryID=${categoryID}`);
    }
  }
  const products = mergeDirectLabsCatalog(responses, cfg.baseUrl);
  deps.onLog?.(`catalog(api): ${products.length} products across ${responses.length}/${DIRECTLABS_CATEGORY_IDS.length} categories`);
  return products;
}
