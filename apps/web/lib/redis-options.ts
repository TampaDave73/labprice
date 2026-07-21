// ioredis connection options for the web app's ad-hoc BullMQ producers (admin scrape triggers).
// `localhost` intermittently resolves to IPv6 (::1) on Windows, which this Docker Desktop setup's
// port forwarding doesn't reliably answer on — connections "succeed" (TCP connects) then reset on
// the first real read/write (ECONNRESET storm, found live 2026-07-04). Same fix as
// `apps/worker/src/redis.ts` (127.0.0.1, not localhost). Was duplicated inline in the single-vendor
// scrape route; shared here once the bulk scrape-all route became a second producer.
// username/password must be carried over from REDIS_URL too — dropping them worked fine against
// unauthenticated local Redis but hung/NOAUTH'd against Railway prod Redis (found live 2026-07-20).
export function redisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  return {
    host: url.hostname === 'localhost' ? '127.0.0.1' : url.hostname,
    port: Number(url.port) || 6379,
    ...(url.username ? { username: url.username } : {}),
    ...(url.password ? { password: url.password } : {}),
    maxRetriesPerRequest: null as null,
  };
}
