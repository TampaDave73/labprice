// `scrape-execute` worker: scrape one offering's price, record a ScrapeRun, and (if the price moved)
// stage a StagedPriceChange. It auto-approves within the Settings thresholds — modulated by vendor
// trust (LOW = always manual review, HIGH = 1.5x thresholds) — else the change waits in the Change
// Queue. Auto-approved changes are handed to the `scrape-publish` queue.
import { Worker, type Job } from 'bullmq';
import { prisma, Prisma, getEffectiveTrust, getScrapeSettings, type TrustLevel } from '@labprice/database';
import type { VendorConfig, ScrapeResult, ScrapeError } from '@labprice/scrapers';
import { PlaywrightEngine } from '@labprice/scrapers/src/engines/playwright-engine';
import { redisConnection } from '../redis';
import { scrapePublishQueue } from '../queues';
import { sendScrapeFailureAlert } from '../report';

// Prisma 6 exposes Decimal under the Prisma namespace; alias it for use as type + value.
type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

interface ExecuteJobData {
  offeringId: string;
  vendorId: string;
  testId: string;
  // Who queued this: the daily tick sets SCHEDULE; admin "Scrape now" jobs omit it (MANUAL).
  // Scheduled failures email an alert — manual ones are watched live in the admin UI.
  triggeredBy?: 'SCHEDULE' | 'MANUAL' | 'RETRY';
}

function isScrapeError(r: ScrapeResult | ScrapeError): r is ScrapeError {
  return 'errorType' in r;
}

/**
 * Auto-approval rules (BR-6 to BR-9), modulated by vendor trust:
 * BR-6: Price decrease within threshold → auto-approve
 * BR-7: Price increase within threshold → auto-approve
 * BR-8: First price (no previous) → auto-approve (unless LOW trust)
 * BR-9: Price unchanged → no staged change needed (handled by caller)
 *
 * LOW trust  → never auto-approve (everything goes to the Change Queue).
 * HIGH trust → more lenient thresholds; MEDIUM → standard thresholds.
 */
function shouldAutoApprove(
  oldPrice: Decimal | null,
  newPrice: Decimal,
  trust: TrustLevel,
  baseDecrease: number,
  baseIncrease: number,
): boolean {
  if (trust === 'LOW') return false;

  if (!oldPrice) return true; // BR-8

  const old = oldPrice.toNumber();
  const nw = newPrice.toNumber();

  if (old === 0) return true;

  const changePercent = ((nw - old) / old) * 100;
  // HIGH trust gets 1.5× the configured thresholds.
  const factor = trust === 'HIGH' ? 1.5 : 1;
  const maxDecrease = baseDecrease * factor;
  const maxIncrease = baseIncrease * factor;

  if (changePercent < 0 && Math.abs(changePercent) <= maxDecrease) return true; // BR-6
  if (changePercent > 0 && changePercent <= maxIncrease) return true; // BR-7

  return false;
}

export function createExecuteWorker() {
  const engine = new PlaywrightEngine();

  const worker = new Worker<ExecuteJobData>(
    'scrape-execute',
    async (job: Job<ExecuteJobData>) => {
      const { offeringId, vendorId, testId, triggeredBy = 'MANUAL' } = job.data;
      console.log(`[execute] Scraping offering=${offeringId} vendor=${vendorId} test=${testId}`);

      const offering = await prisma.offering.findUnique({
        where: { id: offeringId },
        include: { vendor: true, test: true },
      });

      if (!offering) {
        throw new Error(`Offering ${offeringId} not found`);
      }

      // Create a scrape job + run record
      const scrapeJob = await prisma.scrapeJob.create({
        data: {
          vendorId,
          triggeredBy,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      const scrapeRun = await prisma.scrapeRun.create({
        data: {
          jobId: scrapeJob.id,
          vendorId,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      const startTime = Date.now();

      // Build vendor config from the per-vendor scrape config (managed in admin).
      const dbConfig = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId } });
      const selectors = (dbConfig?.selectors as Record<string, string> | null) ?? {};
      const vendorConfig: VendorConfig = {
        vendorId: offering.vendor.id,
        vendorSlug: offering.vendor.slug,
        engine: dbConfig?.engine === 'HTTP' ? 'http' : 'playwright',
        baseUrl: dbConfig?.baseUrl ?? offering.vendor.websiteUrl ?? '',
        rateLimit: { maxConcurrent: 1, delayMs: 2000 },
        selectors: {
          priceSelector: selectors.priceSelector ?? '.price',
          nameSelector: selectors.nameSelector,
          containerSelector: selectors.containerSelector,
        },
        testUrls: {
          [testId]: offering.externalUrl ?? '',
        },
      };

      const result = await engine.scrape(vendorConfig, testId);
      const durationMs = Date.now() - startTime;

      if (isScrapeError(result)) {
        console.error(`[execute] Scrape error for offering=${offeringId}: ${result.message}`);

        await prisma.scrapeRun.update({
          where: { id: scrapeRun.id },
          data: {
            status: 'FAILED',
            errorsCount: 1,
            durationMs,
            completedAt: new Date(),
          },
        });

        await prisma.scrapeJob.update({
          where: { id: scrapeJob.id },
          data: { status: 'FAILED', completedAt: new Date(), errorMessage: result.message },
        });

        // Alert on scheduled failures only, and only once retries are exhausted (a retryable error
        // that succeeds on attempt 2 shouldn't email anyone). Throttled per vendor/day in report.ts.
        const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        if (triggeredBy === 'SCHEDULE' && (!result.retryable || finalAttempt)) {
          await sendScrapeFailureAlert(vendorId, offering.vendor.name, `${offering.test.name}: ${result.message}`);
        }

        if (result.retryable) {
          throw new Error(`Retryable scrape error: ${result.message}`);
        }
        return { status: 'error', error: result.message };
      }

      // Success — record result
      const scrapedPrice = new Decimal(result.scrapedPrice);

      await prisma.scrapeResult.create({
        data: {
          runId: scrapeRun.id,
          testId,
          scrapedPrice,
          matchedOfferingId: offeringId,
          status: offering.currentPrice && scrapedPrice.equals(offering.currentPrice)
            ? 'PRICE_SAME'
            : 'PRICE_CHANGED',
        },
      });

      // Check if price changed (BR-9: skip if unchanged)
      const priceChanged = !offering.currentPrice || !scrapedPrice.equals(offering.currentPrice);

      if (priceChanged) {
        const trust = await getEffectiveTrust(vendorId, offering.vendor.trustOverride);
        const settings = await getScrapeSettings();
        const autoApprove = shouldAutoApprove(
          offering.currentPrice,
          scrapedPrice,
          trust,
          settings.autoApproveDecreasePercent,
          settings.autoApproveIncreasePercent,
        );
        const status = autoApprove ? 'AUTO_APPROVED' : 'PENDING';

        const staged = await prisma.stagedPriceChange.create({
          data: {
            offeringId,
            oldPrice: offering.currentPrice,
            newPrice: scrapedPrice,
            scrapedAt: result.scrapedAt,
            scrapeRunId: scrapeRun.id,
            status,
          },
        });

        console.log(`[execute] Price change staged: ${offering.currentPrice} → ${scrapedPrice} (${status})`);

        if (autoApprove) {
          await scrapePublishQueue.add('publish', { stagedChangeId: staged.id });
        }
      }

      await prisma.scrapeRun.update({
        where: { id: scrapeRun.id },
        data: {
          status: 'SUCCESS',
          testsFound: 1,
          pricesUpdated: priceChanged ? 1 : 0,
          pricesUnchanged: priceChanged ? 0 : 1,
          errorsCount: 0,
          durationMs,
          completedAt: new Date(),
        },
      });

      await prisma.scrapeJob.update({
        where: { id: scrapeJob.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      return { status: 'success', priceChanged, newPrice: scrapedPrice.toString() };
    },
    { connection: redisConnection, concurrency: 3 },
  );

  worker.on('closed', () => engine.cleanup());
  return worker;
}
