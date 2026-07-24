// Server-only wrapper around the GA4 Data API — pulls session/geo/device counts and our custom
// funnel-event counts (search, vendor_click, etc. — see CHANGELOG 2026-07-21 "GA4 custom events")
// back into /admin/analytics. This is distinct from NEXT_PUBLIC_GA_MEASUREMENT_ID: that's the
// client-side tracking tag; this reads a GCP service account granted Viewer on the GA4 property.
// Optional end to end — every export here is a no-op/null when GA4_PROPERTY_ID or the service
// account creds aren't configured, so the admin page just omits this section instead of failing.
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const propertyId = process.env.GA4_PROPERTY_ID;
const clientEmail = process.env.GA4_CLIENT_EMAIL;
// Service-account keys live in env vars as a single line with literal "\n" escapes (real newlines
// can't survive a `KEY=value` line in .env/Railway); the SDK needs actual newline characters. The
// replace is a no-op if the value already has real newlines (e.g. pasted as a Railway multiline var).
const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n');

export const GA4_CONFIGURED = !!(propertyId && clientEmail && privateKey);

let client: BetaAnalyticsDataClient | null = null;
function getClient(): BetaAnalyticsDataClient {
  if (!client) {
    client = new BetaAnalyticsDataClient({ credentials: { client_email: clientEmail, private_key: privateKey } });
  }
  return client;
}

// Mirrors the trackEvent() call sites wired up 2026-07-21 (lib/gtag.ts) — the actual funnel steps
// worth watching (search happened, suggestion click, vendor "Order" click, a form opened vs submitted).
const FUNNEL_EVENTS = ['search', 'search_suggestion_click', 'vendor_click', 'suggestion_modal_opened', 'suggestion_submitted'];

export type Ga4Summary = {
  topCountries: { country: string; sessions: number }[];
  devices: { device: string; sessions: number }[];
  funnelEvents: { event: string; count: number }[];
};

// Why not batchRunReports: three independent single-dimension reports are simpler to type/shape than
// the batch request/response proto, and they run in parallel anyway — no real latency cost.
export async function fetchGa4Summary(days: number): Promise<Ga4Summary | null> {
  if (!GA4_CONFIGURED) return null;

  const property = `properties/${propertyId}`;
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];

  const [[countryResp], [deviceResp], [eventResp]] = await Promise.all([
    getClient().runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
    getClient().runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }),
    getClient().runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: FUNNEL_EVENTS } } },
    }),
  ]);

  const topCountries = (countryResp.rows ?? []).map((r) => ({
    country: r.dimensionValues?.[0]?.value || 'Unknown',
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
  }));
  const devices = (deviceResp.rows ?? []).map((r) => ({
    device: r.dimensionValues?.[0]?.value || 'Unknown',
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
  }));
  // Fill every funnel step even if GA4 returned zero rows for it (a step with no events yet should
  // read as "0", not silently disappear from the table).
  const eventCounts = new Map((eventResp.rows ?? []).map((r) => [r.dimensionValues?.[0]?.value ?? '', Number(r.metricValues?.[0]?.value ?? 0)]));
  const funnelEvents = FUNNEL_EVENTS.map((event) => ({ event, count: eventCounts.get(event) ?? 0 }));

  return { topCountries, devices, funnelEvents };
}
