import IORedis, { type RedisOptions } from 'ioredis';

const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

/**
 * Connection OPTIONS for BullMQ. Pass THIS (not the shared `connection` instance) to every Worker:
 * BullMQ then builds a dedicated connection per worker. Sharing one ioredis instance across multiple
 * blocking Workers caused a `write ECONNABORTED` reconnect storm (each Worker issues blocking reads
 * and needs its own socket; one worker's lifecycle aborted the others' writes). This is the fix for
 * the long-standing "worker Redis reconnect storm".
 *
 * - `maxRetriesPerRequest: null` is required by BullMQ Workers.
 * - localhost → 127.0.0.1 so Windows doesn't intermittently resolve to IPv6 (::1).
 */
export const redisConnection: RedisOptions = {
  host: url.hostname === 'localhost' ? '127.0.0.1' : url.hostname,
  port: Number(url.port) || 6379,
  ...(url.username ? { username: url.username } : {}),
  ...(url.password ? { password: url.password } : {}),
  maxRetriesPerRequest: null,
};

/**
 * Shared instance for non-blocking producers (Queues) + health-check reads + shutdown. Queues only
 * issue non-blocking commands, so sharing one connection among them is safe (unlike Workers).
 */
export const connection = new IORedis(redisConnection);
