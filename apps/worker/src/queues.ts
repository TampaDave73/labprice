import { Queue } from 'bullmq';
import { connection } from './redis';

/** Daily fan-out that creates individual scrape jobs per offering. */
export const scrapeScheduleQueue = new Queue('scrape-schedule', { connection });

/** Per-vendor-test scrape jobs, concurrency 3. */
export const scrapeExecuteQueue = new Queue('scrape-execute', { connection });

/** Publish approved price changes to the live offering record. */
export const scrapePublishQueue = new Queue('scrape-publish', { connection });

/** Monthly partition maintenance for time-series tables. */
export const partitionMaintainQueue = new Queue('partition-maintain', { connection });
