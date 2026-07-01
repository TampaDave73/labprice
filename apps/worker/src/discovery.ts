// Catalog-discovery persistence: run a catalog-based vendor scrape (GoodLabs-style) and write the
// results into our DB — ScrapeJob/Run/Result rows plus StagedPriceChanges. Shared by the BullMQ
// `scrape-discover` worker and the standalone `scripts/discover-goodlabs.ts` runner so both take the
// exact same code path (the worker path is gated on the known Redis-reconnect issue).
//
// Match → persistence mapping:
//   matched   → ScrapeResult(PRICE_CHANGED|PRICE_SAME); stage a change if the price moved, auto-
//               approving within trust/settings thresholds (same rules as scrape-execute).
//   ambiguous → ScrapeResult(MATCHED, no price); stage the LOWEST candidate as PENDING (never auto-
//               approved) with a reviewNote listing every candidate → lands in the Change Queue.
//   unmatched → ScrapeResult(UNMATCHED); nothing staged.
import { prisma, Prisma, getEffectiveTrust, getScrapeSettings, type TrustLevel } from '@labprice/database';
import {
  discover,
  httpFetchHtml,
  type CatalogScrapeConfig,
  type OfferingMatch,
  type TestKey,
} from '@labprice/scrapers';

const Decimal = Prisma.Decimal;

export interface DiscoveryOptions {
  vendorId: string;
  triggeredBy?: 'SCHEDULE' | 'MANUAL' | 'RETRY';
  /** Only rediscover these offering ids (used by requeue-on-add). Omit = all active offerings. */
  offeringIds?: string[];
  /** Inject a fetcher for tests; defaults to plain HTTP (no browser needed for GoodLabs). */
  fetchHtml?: (url: string) => Promise<string>;
  onLog?: (msg: string) => void;
}

export interface DiscoverySummary {
  runId: string;
  matched: number;
  ambiguous: number;
  unmatched: number;
  staged: number;
  autoApprovedStagedIds: string[];
}

/** Default catalog config, overlaid with per-vendor DB config (baseUrl / catalogPath in selectors). */
function buildConfig(dbBaseUrl: string | null, websiteUrl: string | null, selectors: Record<string, unknown>): CatalogScrapeConfig {
  return {
    baseUrl: dbBaseUrl || websiteUrl || 'https://goodlabs.com',
    catalogPath: (selectors.catalogPath as string) || '/book-tests?step=PANEL_SELECTION',
    rateLimitMs: 800,
    matchOptions: {
      matchPriority: ['quest', 'labcorp', 'name'],
      includePanels: false,
      flagAmbiguous: true,
      ...(typeof selectors.preferredProvider === 'string' ? { preferredProvider: selectors.preferredProvider } : {}),
    },
  };
}

export async function runVendorDiscovery(opts: DiscoveryOptions): Promise<DiscoverySummary> {
  const log = opts.onLog ?? (() => {});
  const vendor = await prisma.vendor.findUnique({ where: { id: opts.vendorId }, include: { scrapeConfig: true } });
  if (!vendor) throw new Error(`Vendor ${opts.vendorId} not found`);

  const selectors = (vendor.scrapeConfig?.selectors as Record<string, unknown> | null) ?? {};
  const cfg = buildConfig(vendor.scrapeConfig?.baseUrl ?? null, vendor.websiteUrl, selectors);

  const offerings = await prisma.offering.findMany({
    where: {
      vendorId: opts.vendorId,
      isActive: true,
      deletedAt: null,
      ...(opts.offeringIds ? { id: { in: opts.offeringIds } } : {}),
    },
    include: { test: { select: { id: true, name: true, questCode: true, labcorpCode: true } } },
  });
  log(`${offerings.length} active offering(s) to price`);

  const tests: TestKey[] = offerings.map((o) => ({
    id: o.test.id,
    name: o.test.name,
    questCode: o.test.questCode,
    labcorpCode: o.test.labcorpCode,
  }));
  const testToOffering = new Map(offerings.map((o) => [o.test.id, o]));

  // Resolve trust BEFORE creating this run — otherwise the in-progress (RUNNING, not-yet-succeeded)
  // run would count against the vendor's success rate and force a brand-new vendor to LOW.
  const trust = await getEffectiveTrust(opts.vendorId, vendor.trustOverride);
  const settings = await getScrapeSettings();

  // Create job + run bookkeeping up front so failures still leave a trail.
  const job = await prisma.scrapeJob.create({
    data: { vendorId: opts.vendorId, triggeredBy: opts.triggeredBy ?? 'MANUAL', status: 'RUNNING', startedAt: new Date() },
  });
  const run = await prisma.scrapeRun.create({
    data: { jobId: job.id, vendorId: opts.vendorId, status: 'RUNNING', startedAt: new Date() },
  });

  const started = Date.now();
  let matches: OfferingMatch[];
  try {
    const result = await discover(tests, { fetchHtml: opts.fetchHtml ?? httpFetchHtml(), onLog: log }, cfg);
    matches = result.matches;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.scrapeRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorsCount: 1, completedAt: new Date(), durationMs: Date.now() - started } });
    await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'FAILED', completedAt: new Date(), errorMessage: message } });
    await prisma.scrapeError.create({ data: { runId: run.id, errorType: 'OTHER', message } });
    throw e;
  }

  const summary: DiscoverySummary = { runId: run.id, matched: 0, ambiguous: 0, unmatched: 0, staged: 0, autoApprovedStagedIds: [] };

  for (const { test, result } of matches) {
    const offering = testToOffering.get(test.id)!;

    if (result.status === 'unmatched') {
      summary.unmatched++;
      await prisma.scrapeResult.create({ data: { runId: run.id, testId: test.id, status: 'UNMATCHED', matchedOfferingId: offering.id } });
      continue;
    }

    if (result.status === 'ambiguous') {
      summary.ambiguous++;
      // Suggest the cheapest concrete candidate but ALWAYS require manual review.
      const prices = result.candidates.map((c) => c.price).filter((p): p is number => p != null).sort((a, b) => a - b);
      const suggested = prices[0];
      await prisma.scrapeResult.create({
        data: { runId: run.id, testId: test.id, status: 'MATCHED', matchedOfferingId: offering.id, scrapedPrice: suggested != null ? new Decimal(suggested) : null },
      });
      if (suggested != null) {
        const note = `AMBIGUOUS (${result.candidates.length} candidates): ` +
          result.candidates.map((c) => `${c.productName} [${c.labProvider}] ${c.price != null ? '$' + c.price : '—'}${c.isPanel ? ' (panel)' : ''}`).join('; ');
        await prisma.stagedPriceChange.create({
          data: { offeringId: offering.id, oldPrice: offering.currentPrice, newPrice: new Decimal(suggested), scrapedAt: new Date(), scrapeRunId: run.id, status: 'PENDING', reviewNote: note.slice(0, 1000) },
        });
        summary.staged++;
      }
      continue;
    }

    // matched
    summary.matched++;
    // Store the exact product URL so the public "Order"/verify link points at the right page, and
    // admins can confirm the price. Set it even when the price is unchanged.
    if (result.sourceUrl && result.sourceUrl !== offering.externalUrl) {
      await prisma.offering.update({ where: { id: offering.id }, data: { externalUrl: result.sourceUrl } });
    }
    const price = new Decimal(result.price!);
    const priceChanged = !offering.currentPrice || !price.equals(offering.currentPrice);
    await prisma.scrapeResult.create({
      data: { runId: run.id, testId: test.id, status: priceChanged ? 'PRICE_CHANGED' : 'PRICE_SAME', matchedOfferingId: offering.id, scrapedPrice: price },
    });
    if (priceChanged) {
      const autoApprove = shouldAutoApprove(offering.currentPrice, price, trust, settings.autoApproveDecreasePercent, settings.autoApproveIncreasePercent);
      const staged = await prisma.stagedPriceChange.create({
        data: {
          offeringId: offering.id, oldPrice: offering.currentPrice, newPrice: price, scrapedAt: new Date(),
          scrapeRunId: run.id, status: autoApprove ? 'AUTO_APPROVED' : 'PENDING',
          reviewNote: `Matched by ${result.matchedBy} → ${result.provider} @ ${result.sourceUrl}`,
        },
      });
      summary.staged++;
      if (autoApprove) summary.autoApprovedStagedIds.push(staged.id);
    }
  }

  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: {
      status: 'SUCCESS', testsFound: matches.length, pricesUpdated: summary.matched, pricesUnchanged: 0,
      errorsCount: 0, durationMs: Date.now() - started, completedAt: new Date(),
    },
  });
  await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date() } });

  log(`done: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched, ${summary.staged} staged`);
  return summary;
}

/** Same trust-modulated auto-approve rules as scrape-execute (BR-6..BR-9). */
function shouldAutoApprove(oldPrice: Prisma.Decimal | null, newPrice: Prisma.Decimal, trust: TrustLevel, baseDecrease: number, baseIncrease: number): boolean {
  if (trust === 'LOW') return false;
  if (!oldPrice) return true;
  const old = oldPrice.toNumber();
  const nw = newPrice.toNumber();
  if (old === 0) return true;
  const changePercent = ((nw - old) / old) * 100;
  const factor = trust === 'HIGH' ? 1.5 : 1;
  if (changePercent < 0 && Math.abs(changePercent) <= baseDecrease * factor) return true;
  if (changePercent > 0 && changePercent <= baseIncrease * factor) return true;
  return false;
}

/** Publish one approved/auto-approved staged change to the live offering (used inline by the runner). */
export async function publishStagedChange(stagedChangeId: string): Promise<boolean> {
  const staged = await prisma.stagedPriceChange.findUnique({ where: { id: stagedChangeId } });
  if (!staged || (staged.status !== 'APPROVED' && staged.status !== 'AUTO_APPROVED')) return false;
  await prisma.offering.update({
    where: { id: staged.offeringId },
    data: { previousPrice: staged.oldPrice, currentPrice: staged.newPrice, priceUpdatedAt: new Date() },
  });
  await prisma.priceHistory.create({
    data: { offeringId: staged.offeringId, oldPrice: staged.oldPrice, newPrice: staged.newPrice, observedAt: staged.scrapedAt, source: 'SCRAPE', scrapeRunId: staged.scrapeRunId },
  });
  await prisma.stagedPriceChange.update({ where: { id: stagedChangeId }, data: { reviewedAt: new Date() } });
  return true;
}
