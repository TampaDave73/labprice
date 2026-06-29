import { prisma } from './client';
import type { TrustLevel } from '@prisma/client';

export interface VendorTrustMetrics {
  totalRuns: number;
  successfulRuns: number;
  successRate: number; // 0..1
  lastSuccessAt: Date | null;
  daysSinceSuccess: number | null;
  recentChanges: number;
  rejectedChanges: number;
  rejectRate: number; // 0..1
  score: number; // 0..100
  computed: TrustLevel;
  hasData: boolean;
}

const DAY_MS = 86_400_000;
const RUN_WINDOW = 20; // recent runs considered
const CHANGE_WINDOW = 30; // recent staged changes considered

export function scoreToLevel(score: number): TrustLevel {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

type RunRow = { status: string; completedAt: Date | null };
type ChangeRow = { status: string };

/**
 * Pure scorer shared by the single-vendor and batched paths.
 *  - success rate of recent runs (up to 60 pts)
 *  - freshness: how recently a run last succeeded (up to 25 pts)
 *  - low volatility: how rarely staged changes get rejected (up to 15 pts)
 * No history → neutral score of 50 (MEDIUM).
 */
function computeMetrics(runs: RunRow[], changes: ChangeRow[]): VendorTrustMetrics {
  const totalRuns = runs.length;
  const successfulRuns = runs.filter((r) => r.status === 'SUCCESS').length;
  const successRate = totalRuns ? successfulRuns / totalRuns : 0;
  const lastSuccess = runs.find((r) => r.status === 'SUCCESS' && r.completedAt);
  const lastSuccessAt = lastSuccess?.completedAt ?? null;
  const daysSinceSuccess = lastSuccessAt ? (Date.now() - lastSuccessAt.getTime()) / DAY_MS : null;

  const recentChanges = changes.length;
  const rejectedChanges = changes.filter((c) => c.status === 'REJECTED').length;
  const rejectRate = recentChanges ? rejectedChanges / recentChanges : 0;

  let score: number;
  if (totalRuns === 0) {
    score = 50; // neutral default when there's no scraper history yet
  } else {
    const successPts = 60 * successRate;
    let freshPts = 0;
    if (daysSinceSuccess === null) freshPts = 0;
    else if (daysSinceSuccess <= 7) freshPts = 25;
    else if (daysSinceSuccess >= 30) freshPts = 0;
    else freshPts = 25 * (1 - (daysSinceSuccess - 7) / 23);
    const volPts = 15 * (1 - rejectRate);
    score = Math.round(successPts + freshPts + volPts);
  }

  return {
    totalRuns,
    successfulRuns,
    successRate,
    lastSuccessAt,
    daysSinceSuccess,
    recentChanges,
    rejectedChanges,
    rejectRate,
    score,
    computed: scoreToLevel(score),
    hasData: totalRuns > 0,
  };
}

/** Full metrics for a single vendor (used by the vendor detail page). */
export async function getVendorTrustMetrics(vendorId: string): Promise<VendorTrustMetrics> {
  const [runs, changes] = await Promise.all([
    prisma.scrapeRun.findMany({
      where: { vendorId },
      orderBy: { startedAt: 'desc' },
      take: RUN_WINDOW,
      select: { status: true, completedAt: true },
    }),
    prisma.stagedPriceChange.findMany({
      where: { offering: { vendorId } },
      orderBy: { createdAt: 'desc' },
      take: CHANGE_WINDOW,
      select: { status: true },
    }),
  ]);
  return computeMetrics(runs, changes);
}

/**
 * Batched trust for many vendors — TWO queries total instead of 2-per-vendor.
 * Fixes the slow admin vendor list (N+1). Returns vendorId → computed TrustLevel.
 */
export async function getVendorTrustMap(vendorIds: string[]): Promise<Map<string, TrustLevel>> {
  const map = new Map<string, TrustLevel>();
  if (vendorIds.length === 0) return map;

  const [runs, changes] = await Promise.all([
    prisma.scrapeRun.findMany({
      where: { vendorId: { in: vendorIds } },
      orderBy: { startedAt: 'desc' },
      select: { vendorId: true, status: true, completedAt: true },
    }),
    prisma.stagedPriceChange.findMany({
      where: { offering: { vendorId: { in: vendorIds } } },
      orderBy: { createdAt: 'desc' },
      select: { status: true, offering: { select: { vendorId: true } } },
    }),
  ]);

  const runsByVendor = new Map<string, RunRow[]>();
  for (const r of runs) {
    const arr = runsByVendor.get(r.vendorId) ?? [];
    if (arr.length < RUN_WINDOW) arr.push({ status: r.status, completedAt: r.completedAt });
    runsByVendor.set(r.vendorId, arr);
  }

  const changesByVendor = new Map<string, ChangeRow[]>();
  for (const c of changes) {
    const vid = c.offering.vendorId;
    const arr = changesByVendor.get(vid) ?? [];
    if (arr.length < CHANGE_WINDOW) arr.push({ status: c.status });
    changesByVendor.set(vid, arr);
  }

  for (const vid of vendorIds) {
    map.set(vid, computeMetrics(runsByVendor.get(vid) ?? [], changesByVendor.get(vid) ?? []).computed);
  }
  return map;
}

/** Effective trust = manual override if pinned, else the auto-computed level. */
export async function getEffectiveTrust(
  vendorId: string,
  override?: TrustLevel | null,
): Promise<TrustLevel> {
  if (override) return override;
  const m = await getVendorTrustMetrics(vendorId);
  return m.computed;
}
