// The canonical list of catalog-scraper adapters, as display metadata.
//
// why it lives in @labprice/shared rather than next to the adapters themselves: the admin vendor
// editor needs the list in a *client* component, and `@labprice/scrapers`'s ADAPTERS registry imports
// every parser (plus cheerio and playwright) — importing it into the browser bundle is not an option.
// So the registry stays in `packages/scrapers/src/catalog/adapters.ts` and this file carries only the
// names + labels, with `adapters.test.ts` asserting the two never drift apart.
//
// why the assertion matters: `getAdapter()` falls back to the GoodLabs adapter for any name it does
// not know (`ADAPTERS[name] || goodlabsAdapter`). An adapter missing from this list is invisible in
// the admin dropdown (it used to be a hand-maintained <option> list, which silently lost
// marekdiagnostics, jasonhealth and drsays); a name in this list with no adapter behind it is worse —
// picking it crawls goodlabs.com and attaches its products to the wrong vendor.
export interface CatalogAdapterInfo {
  /** Value stored in `ScrapeVendorConfig.selectors.adapter`. Must be a canonical key of ADAPTERS. */
  name: string;
  /** Vendor name shown in the admin dropdown. */
  label: string;
  /** Site the adapter parses, shown alongside the label to disambiguate similar vendor names. */
  site: string;
}

export const CATALOG_ADAPTERS: readonly CatalogAdapterInfo[] = [
  { name: 'goodlabs', label: 'GoodLabs', site: 'goodlabs.com' },
  { name: 'ownyourlabs', label: 'Own Your Labs', site: 'ownyourlabs.com' },
  { name: 'dirtcheaplabs', label: 'Dirt Cheap Labs', site: 'dirtcheaplabs.com' },
  { name: 'mitohealth', label: 'Mito Health', site: 'mitohealth.com' },
  { name: 'anabolicinsights', label: 'Anabolic Insights', site: 'anabolicinsights.ai' },
  { name: 'algorx', label: 'AlgoRx', site: 'algorx.com' },
  { name: 'walkinlab', label: 'Walk-In Lab', site: 'walkinlab.com' },
  { name: 'personalabs', label: 'Personalabs', site: 'personalabs.com' },
  { name: 'healthlabs', label: 'HealthLabs.com', site: 'healthlabs.com' },
  { name: 'privatemdlabs', label: 'Private MD Labs', site: 'privatemdlabs.com' },
  { name: 'requestatest', label: 'Request A Test', site: 'requestatest.com' },
  { name: 'directlabs', label: 'DirectLabs', site: 'directlabs.com' },
  { name: 'discountedlabs', label: 'Discounted Labs', site: 'discountedlabs.com' },
  { name: 'truehealthlabs', label: 'True Health Labs', site: 'truehealthlabs.com' },
  { name: 'questhealth', label: 'Quest Health', site: 'questhealth.com' },
  { name: 'labcorpondemand', label: 'LabCorp OnDemand', site: 'ondemand.labcorp.com' },
  { name: 'marekdiagnostics', label: 'Marek Diagnostics', site: 'marekdiagnostics.com' },
  { name: 'jasonhealth', label: 'Jason Health', site: 'jasonhealth.com' },
  { name: 'drsays', label: 'DrSays', site: 'drsays.com' },
];
