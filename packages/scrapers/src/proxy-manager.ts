import { prisma } from '@labprice/database';

interface Proxy {
  id: string;
  url: string;
  protocol: string;
  country: string | null;
  is_active: boolean;
  success_count: number;
  fail_count: number;
  avg_latency_ms: number | null;
  last_checked_at: Date | null;
  last_used_at: Date | null;
}

export class ProxyManager {
  /**
   * Returns the best available proxy using health-weighted selection.
   * Prefers proxies with higher success rates and lower latency.
   */
  async getProxy(): Promise<Proxy | null> {
    const proxies = await prisma.$queryRawUnsafe<Proxy[]>(`
      SELECT * FROM proxies
      WHERE is_active = true
      ORDER BY
        CASE WHEN (success_count + fail_count) = 0 THEN 0.5
             ELSE CAST(success_count AS FLOAT) / (success_count + fail_count)
        END DESC,
        COALESCE(avg_latency_ms, 9999) ASC,
        last_used_at ASC NULLS FIRST
      LIMIT 1
    `);

    const proxy = proxies[0] ?? null;

    if (proxy) {
      await prisma.$executeRawUnsafe(
        `UPDATE proxies SET last_used_at = NOW() WHERE id = $1`,
        proxy.id,
      );
    }

    return proxy;
  }

  /**
   * Report a successful proxy usage. Updates success_count and rolling avg latency.
   */
  async reportSuccess(proxyId: string, latencyMs: number): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE proxies SET
        success_count = success_count + 1,
        avg_latency_ms = CASE
          WHEN avg_latency_ms IS NULL THEN $2
          ELSE (avg_latency_ms * 0.8 + $2 * 0.2)
        END,
        last_checked_at = NOW()
      WHERE id = $1`,
      proxyId,
      latencyMs,
    );
  }

  /**
   * Report a failed proxy usage. Increment fail_count and auto-disable
   * if fail rate exceeds 50% over the last 20 attempts.
   */
  async reportFailure(proxyId: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE proxies SET
        fail_count = fail_count + 1,
        last_checked_at = NOW(),
        is_active = CASE
          WHEN (success_count + fail_count + 1) >= 20
               AND CAST(fail_count + 1 AS FLOAT) / (success_count + fail_count + 1) > 0.5
          THEN false
          ELSE is_active
        END
      WHERE id = $1`,
      proxyId,
    );
  }

  /**
   * Test all active proxies and disable unreachable ones.
   */
  async healthCheck(): Promise<{ checked: number; disabled: number }> {
    const proxies = await prisma.$queryRawUnsafe<Proxy[]>(
      `SELECT * FROM proxies WHERE is_active = true`,
    );

    let disabled = 0;

    for (const proxy of proxies) {
      try {
        const start = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);

        await fetch(proxy.url, {
          method: 'HEAD',
          signal: controller.signal,
        });

        clearTimeout(timer);
        const latency = Date.now() - start;
        await this.reportSuccess(proxy.id, latency);
      } catch {
        await this.reportFailure(proxy.id);
        disabled++;
      }
    }

    return { checked: proxies.length, disabled };
  }
}
