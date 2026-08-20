// Anabolic Insights (anabolicinsights.ai) is an API vendor: the /labs/panels/biomarkers page is a
// client-rendered shell (its server HTML contains NO catalog data — don't try to parse the page),
// and the priced catalog comes from one public JSON endpoint:
//   GET ${apiBase}/api/lab-biomarkers/multi-lab-pricing
// No auth, cookies, or special headers required (verified 2026-08-20).
//
// Each entry is one biomarker carrying a `labOptions[]` — the SAME test priced at up to three labs
// (Quest / LabCorp / Bioreference), each with its own order code (`providerId`) and `basePrice`. That
// maps onto one CatalogProduct with a provider per lab, so the matcher's `mergeCodeTiers` picks the
// cheapest code-matching lab and surfaces the other as the secondary "also available via X" price —
// the same shape as Dirt Cheap Labs.
import type { CatalogProduct, ProviderOffering } from './types';

export const AI_DEFAULT_API_BASE = 'https://api.anabolicinsights.ai';
export const AI_CATALOG_PATH = '/api/lab-biomarkers/multi-lab-pricing';
/**
 * Site path for a single biomarker's own page. The API's `loincId` doubles as this URL's segment
 * (`/labs/panels/biomarkers/<loincId>`) — verified live: a real id serves a server-rendered
 * "<name> · Anabolic Insights" <title>, an unknown one falls back to a generic "Biomarker", so the
 * URL is genuinely canonical rather than a client-only route.
 */
export const AI_PRODUCT_PATH = '/labs/panels/biomarkers';

interface AiLabOption {
  labName?: string;
  providerId?: string | number | null;
  basePrice?: number | null;
  isAvailable?: boolean;
}

interface AiBiomarker {
  loincId?: string;
  loincCode?: string;
  name?: string;
  category?: string;
  labOptions?: AiLabOption[];
}

export interface AiCatalogResponse {
  data?: AiBiomarker[];
}

/**
 * Turn the multi-lab-pricing payload into products (one per biomarker, one provider per lab).
 * Pure + testable — `fetchAnabolicInsightsCatalog` is just the HTTP wrapper around this.
 *
 * WHY `isPanel: false` for everything: this endpoint is the à la carte biomarker catalog — every row
 * is individually orderable and the vendor publishes no bundle flag. Several rows are named like
 * panels ("Comp. Metabolic Panel (14)", "Lipid Panel"), but those are real single orderables that we
 * carry as tests too; marking them as panels would make the matcher skip them and we'd lose those
 * prices. Bundles live on a different page (/labs/panels) that this adapter deliberately ignores.
 */
export function mergeAnabolicInsightsCatalog(
  json: AiCatalogResponse,
  baseUrl = 'https://www.anabolicinsights.ai',
): CatalogProduct[] {
  const products: CatalogProduct[] = [];

  for (const b of json.data ?? []) {
    // loincId is the stable per-biomarker UUID (verified unique across the catalog); it's the slug we
    // key on so a vendor rename doesn't orphan the row.
    const slug = b.loincId ?? b.loincCode;
    // Names carry trailing whitespace in the source data ("Lipase ") — trim or every name-tier match
    // and every VendorProduct row inherits it.
    const name = (b.name ?? '').trim();
    if (!slug || !name) continue;

    const providers: ProviderOffering[] = [];
    for (const o of b.labOptions ?? []) {
      if (o.isAvailable === false) continue;
      providers.push({
        labProvider: (o.labName ?? '').trim().toLowerCase(),
        // Not every option publishes a code (17 of 260 at time of writing) — those stay name-matchable.
        labTestIDs: o.providerId != null && String(o.providerId).trim() !== '' ? [String(o.providerId).trim()] : [],
        // `basePrice: 0` means "no real price published", not free — treat it as unpriced so the
        // matcher skips it rather than staging a $0 offering.
        price: typeof o.basePrice === 'number' && o.basePrice > 0 ? o.basePrice : null,
        isPanel: false, // see the note above — à la carte catalog, no bundles.
        name,
      });
    }
    if (providers.length === 0) continue;

    products.push({
      slug,
      name,
      // Deep-link to the biomarker's own page so "Order" lands on the test, not the catalog listing.
      url: `${baseUrl}${AI_PRODUCT_PATH}/${slug}`,
      providers,
    });
  }

  return products;
}

/** Fetch the priced catalog (one call) and map it to products. */
export async function fetchAnabolicInsightsCatalog(
  deps: { fetchHtml: (url: string) => Promise<string>; onLog?: (m: string) => void },
  cfg: { baseUrl: string; apiBase?: string },
): Promise<CatalogProduct[]> {
  const apiBase = cfg.apiBase ?? AI_DEFAULT_API_BASE;
  const txt = await deps.fetchHtml(`${apiBase}${AI_CATALOG_PATH}`);

  let json: AiCatalogResponse;
  try {
    json = JSON.parse(txt);
  } catch {
    deps.onLog?.('  ! anabolicinsights: catalog response was not JSON');
    return [];
  }

  const products = mergeAnabolicInsightsCatalog(json, cfg.baseUrl);
  const offers = products.reduce((n, p) => n + p.providers.length, 0);
  deps.onLog?.(`catalog(api): ${products.length} products / ${offers} lab options`);
  return products;
}
