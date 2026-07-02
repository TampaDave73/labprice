// MitoHealth (mitohealth.com) is an API vendor. Its /shop catalog loads client-side from a tRPC
// endpoint (marketplace.catalog.search) that returns every product with per-provider variants. Each
// variant's metadata carries the provider + member/non-member prices in cents. There are NO Quest/
// LabCorp codes, so matching is name-only. We collapse each product to its cheapest provider (by
// non-member price) and keep both prices — non-member is what we compare on, member is the discount.
import type { CatalogProduct, ProviderOffering } from './types';

export const MITO_DEFAULT_API_BASE = 'https://trpc-bdhnb7m5vq-uc.a.run.app';

interface MitoVariant {
  seller?: { name?: string };
  metadata?: Record<string, unknown>;
}
interface MitoProduct {
  handle: string;
  title: string;
  url?: string;
  variants?: MitoVariant[];
}

const cents = (v: unknown): number | null => (typeof v === 'number' ? Math.round(v) / 100 : null);
const normProvider = (s: string): string => {
  const l = s.toLowerCase();
  if (l.includes('quest')) return 'quest';
  if (l.includes('labcorp')) return 'labcorp';
  return l || 'unknown';
};

/** Map one tRPC product to a CatalogProduct: cheapest provider variant, member + non-member prices. */
function toProduct(p: MitoProduct): CatalogProduct | null {
  if (!p?.handle || !p?.title) return null;
  const variants = (p.variants ?? [])
    .map((v) => {
      const md = v.metadata ?? {};
      return {
        provider: normProvider((md['com.mitohealth.provider'] as string) ?? v.seller?.name ?? ''),
        nonMember: cents(md['com.mitohealth.nonMemberPriceCents']),
        member: cents(md['com.mitohealth.memberPriceCents']),
        skuType: (md['com.mitohealth.skuType'] as string) ?? '',
      };
    })
    .filter((v) => v.nonMember != null);

  const isTest = variants.some((v) => v.skuType === 'labTest');
  variants.sort((a, b) => (a.nonMember ?? Infinity) - (b.nonMember ?? Infinity));
  const best = variants[0];

  const provider: ProviderOffering = {
    labProvider: best?.provider ?? 'unknown',
    labTestIDs: [], // MitoHealth exposes no order codes → name matching only.
    price: best?.nonMember ?? null,
    memberPrice: best?.member ?? null,
    isPanel: !isTest, // Mito bundles (skuType 'mitoPanel') are excluded from single-test matching.
    name: p.title,
  };
  return {
    slug: p.handle,
    name: p.title,
    url: p.url ?? `https://mitohealth.com/products/${p.handle}`,
    providers: [provider],
  };
}

/** Pure: extract products from a tRPC batch response and map them. */
export function parseMitoHealthCatalog(trpcResponse: unknown): CatalogProduct[] {
  const arr = trpcResponse as Array<{ result?: { data?: { products?: MitoProduct[] } } }>;
  const products = arr?.[0]?.result?.data?.products ?? [];
  return products.map(toProduct).filter((p): p is CatalogProduct => p !== null);
}

/** Fetch the whole catalog (paginated) via the injected fetcher and parse it. */
export async function fetchMitoHealthCatalog(
  deps: { fetchHtml: (url: string) => Promise<string>; onLog?: (m: string) => void },
  cfg: { baseUrl: string; apiBase?: string },
): Promise<CatalogProduct[]> {
  const apiBase = cfg.apiBase ?? MITO_DEFAULT_API_BASE;
  const all: CatalogProduct[] = [];
  const limit = 100;
  for (let offset = 0, page = 0; page < 6; offset += limit, page++) {
    const input = encodeURIComponent(
      JSON.stringify({ '0': { context: { address_region: 'FL' }, sort: 'featured', speciality: 'hide', pagination: { limit, offset } } }),
    );
    const txt = await deps.fetchHtml(`${apiBase}/marketplace.catalog.search?batch=1&input=${input}`);
    let batch: CatalogProduct[] = [];
    try {
      const json = JSON.parse(txt);
      batch = parseMitoHealthCatalog(json);
    } catch {
      deps.onLog?.(`  ! bad JSON at offset ${offset}`);
      break;
    }
    all.push(...batch);
    if (batch.length < limit) break; // last page
  }
  deps.onLog?.(`catalog(api): ${all.length} products (${all.filter((p) => !p.providers[0]!.isPanel).length} individual tests)`);
  return all;
}
