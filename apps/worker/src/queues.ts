import { Queue } from 'bullmq';
import { connection } from './redis';

/** Daily fan-out that creates individual scrape jobs per offering. */
export const scrapeScheduleQueue = new Queue('scrape-schedule', { connection });

/** Per-vendor-test scrape jobs, concurrency 3. */
export const scrapeExecuteQueue = new Queue('scrape-execute', { connection });

/** Catalog-based vendor discovery (GoodLabs-style: crawl catalog, match our tests, stage prices). */
export const scrapeDiscoverQueue = new Queue('scrape-discover', { connection });

/** Publish approved price changes to the live offering record. */
export const scrapePublishQueue = new Queue('scrape-publish', { connection });

/** Monthly partition maintenance for time-series tables. */
export const partitionMaintainQueue = new Queue('partition-maintain', { connection });

/** Weekly admin email digest summarizing every scraper's health. */
export const scrapeReportQueue = new Queue('scrape-report', { connection });
