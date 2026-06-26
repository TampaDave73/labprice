import { Worker, type Job } from 'bullmq';
import { Decimal } from '@labprice/database';
import { prisma } from '@labprice/database';
import type { VendorConfig, ScrapeResult, ScrapeError } from '@labprice/scrapers';
import { PlaywrightEngine } from '@labprice/scrapers/src/engines/playwright-engine';
import { connection } from '../redis';
import { scrapePublishQueue } from '../queues';

interface ExecuteJobData {
  offeringId: string;
  vendorId: string;
  testId: string;
}

function isScrapeError(r: ScrapeResult | ScrapeError): r is ScrapeError {
  return 'errorType' in r;
}

/**
 * Auto-approval rules (BR-6 to BR-9):
 * BR-6: Price decrease ≤ 20% → auto-approve
 * BR-7: Price increase ≤ 5% → auto-approve
 * BR-8: First price (no previous) → auto-approve
 * BR-9: Price unchanged → no staged change needed
 */
function shouldAutoApprove(oldPrice: Decimal | null, newPrice: Decimal): boolean {
  if (!oldPrice) return true; // BR-8

  const old = oldPrice.toNumber();
  const nw = newPrice.toNumber();

  if (old === 0) return true;

  const changePercent = ((nw - old) / old) * 100;

  if (changePercent < 0 && Math.abs(changePercent) <= 20) return true; // BR-6
  if (changePercent > 0 && changePercent <= 5) return true; // BR-7

  return false;
}

export function createExecuteWorker() {
  const engine = new PlaywrightEngine();

  const worker = new Worker<ExecuteJobData>(
    'scrape:execute',
    async (job: Job<ExecuteJobData>) => {
      const { offeringId, vendorId, testId } = job.data;
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
          triggeredBy: 'SCHEDULE',
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

      // Build vendor config from DB
      const vendorConfig: VendorConfig = {
        vendorId: offering.vendor.id,
        vendorSlug: offering.vendor.slug,
        engine: 'playwright',
        baseUrl: offering.vendor.websiteUrl ?? '',
        rateLimit: { maxConcurrent: 1, delayMs: 2000 },
        selectors: {
          priceSelector: '.price', // TODO: load from vendor scrape config
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
        const autoApprove = shouldAutoApprove(offering.currentPrice, scrapedPrice);
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
    { connection, concurrency: 3 },
  );

  worker.on('closed', () => engine.cleanup());
  return worker;
}
