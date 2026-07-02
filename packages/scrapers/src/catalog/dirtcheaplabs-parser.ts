// Dirt Cheap Labs (dirtcheaplabs.com) is an API vendor: its /alacarte page loads the priced catalog
// from a JSON API — one call per lab: `${apiBase}/api/catalog/alacarte?lab=labcorp|quest`. Each item
// carries a `lab_code` (the Quest or LabCorp order code) and `retail_cents`. We fetch both labs and
// merge by slug so each test becomes one product with a provider per lab; the matcher (mergeCodeTiers)
// then takes the cheapest code match.
import type { CatalogProduct, ProviderOffering } from './types';

export const DCL_DEFAULT_API_BASE = 'https://api.dirtcheaplabs.com';
export const DCL_LABS = ['labcorp', 'quest'] as const;

interface DclItem {
  slug: string;
  name: string;
  retail_cents?: number;
  lab_code?: string | number;
  lab?: string;
}

/** Merge per-lab catalog JSON into products keyed by slug (one provider per lab). Pure + testable. */
export function mergeDirtCheapLabsCatalog(
  catalogs: { lab: string; json: { items?: DclItem[] } }[],
  baseUrl = 'https://dirtcheaplabs.com',
): CatalogProduct[] {
  const bySlug = new Map<string, CatalogProduct>();
  for (const { lab, json } of catalogs) {
    for (const it of json.items ?? []) {
      if (!it?.slug) continue;
      const provider: ProviderOffering = {
        labProvider: (it.lab ?? lab).toLowerCase(),
        labTestIDs: it.lab_code != null ? [String(it.lab_code)] : [],
        price: typeof it.retail_cents === 'number' ? Math.round(it.retail_cents) / 100 : null,
        isPanel: false, // à la carte items only; DCL panels come from a separate endpoint.
        name: it.name,
      };
      const existing = bySlug.get(it.slug);
      if (existing) existing.providers.push(provider);
      else bySlug.set(it.slug, { slug: it.slug, name: it.name, url: `${baseUrl}/alacarte`, providers: [provider] });
    }
  }
  return [...bySlug.values()];
}

/** Fetch both lab catalogs and merge. Uses the injected fetcher (JSON over the same HTTP path). */
export async function fetchDirtCheapLabsCatalog(
  deps: { fetchHtml: (url: string) => Promise<string>; onLog?: (m: string) => void },
  cfg: { baseUrl: string; apiBase?: string },
): Promise<CatalogProduct[]> {
  const apiBase = cfg.apiBase ?? DCL_DEFAULT_API_BASE;
  const catalogs: { lab: string; json: { items?: DclItem[] } }[] = [];
  for (const lab of DCL_LABS) {
    const txt = await deps.fetchHtml(`${apiBase}/api/catalog/alacarte?lab=${lab}`);
    try {
      catalogs.push({ lab, json: JSON.parse(txt) });
    } catch {
      deps.onLog?.(`  ! bad JSON for lab=${lab}`);
    }
  }
  const products = mergeDirtCheapLabsCatalog(catalogs, cfg.baseUrl);
  deps.onLog?.(`catalog(api): ${products.length} products across ${catalogs.length} lab(s)`);
  return products;
}
