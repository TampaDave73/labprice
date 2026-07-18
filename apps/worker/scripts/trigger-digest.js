// On-demand scraper status report: enqueues one `scrape-report` digest job, which emails all
// admins immediately (instead of waiting for the Monday scheduler). Plain CommonJS so it runs
// with bare `node` inside the worker container — no tsx/quoting gymnastics needed over SSH:
//   railway ssh --service scrape-worker "node /app/apps/worker/scripts/trigger-digest.js"
const IORedis = require('ioredis');
const { Queue } = require('bullmq');

async function main() {
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue('scrape-report', { connection });
  await queue.add('digest', {}, { jobId: `manual-digest-${Date.now()}` });
  console.log('Digest enqueued — the report email goes out within a few seconds.');
  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
