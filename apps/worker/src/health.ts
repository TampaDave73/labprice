import * as http from 'node:http';
import { scrapeScheduleQueue, scrapeExecuteQueue, scrapePublishQueue } from './queues';

const PORT = Number(process.env.HEALTH_PORT ?? 3001);

export function startHealthServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      try {
        const [schedule, execute, publish] = await Promise.all([
          scrapeScheduleQueue.getJobCounts(),
          scrapeExecuteQueue.getJobCounts(),
          scrapePublishQueue.getJobCounts(),
        ]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          queues: {
            schedule: schedule.waiting + schedule.active,
            execute: execute.waiting + execute.active,
            publish: publish.waiting + publish.active,
          },
        }));
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error' }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(PORT, () => {
    console.log(`[worker] Health endpoint listening on :${PORT}`);
  });

  return server;
}
