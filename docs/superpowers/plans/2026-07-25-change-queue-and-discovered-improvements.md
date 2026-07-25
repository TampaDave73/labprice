# Change Queue + Discovered Products Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five reported problems in `/admin/changes` (Change Queue) and `/admin/discovered`
(vendor-product review queue): bulk-clear the pending queue, give Dirt Cheap Labs' Quest and LabCorp
prices independent approve/reject entries, auto-ignore panels instead of showing a dead-end tab,
fix the "Matched, not listed" tab so its count matches its content, and let an admin select exactly
which rows in a cluster get promoted/attached vs. ignored.

**Architecture:** Tasks 1-4 are independent, single-surface fixes (Change Queue bulk-clear, panel
auto-ignore, matched-tab filter, cluster checkboxes) — no schema changes, can be done in any order.
Tasks 5-7 build the dual-lab pricing feature: a pure ranking function (testable in isolation), a
schema migration + one-time backfill, then the scraper write/publish path that uses both. Task 8
adds the Change Queue UI badge on top of the schema from Task 5-6.

**Tech Stack:** Next.js 15 App Router (API routes + client components), Prisma 6 / PostgreSQL,
`packages/scrapers` (vitest for pure-logic tests), `pnpm --filter @labprice/database db:push` for
schema sync (this project has no versioned migrations — see `.claude/CLAUDE.md`).

## Global Constraints

- `apps/web` has no test suite — verify web/API changes with `cd apps/web && npx tsc --noEmit`
  (must be clean) plus manual verification against the admin UI (dev server or the live site with an
  admin session — the user has explicitly authorized working directly against the live site).
- `packages/scrapers` has vitest — any new pure-logic function gets a real unit test in
  `packages/scrapers/src/__tests__/`, following the existing `matcher.test.ts` pattern. Run with
  `cd packages/scrapers && npx vitest run`.
- Prisma client regen can lock on Windows while a dev server holds the query-engine DLL (`.claude/CLAUDE.md`
  gotcha #3) — stop any running `pnpm dev`/`pnpm dev:worker` before `db:push`, then restart after.
- Never overwrite an admin's existing decision on a `VendorProduct` row (`MATCHED`/`IGNORED` are
  admin-owned) — this is an existing, load-bearing rule in `ingestVendorProducts`; new logic must
  respect it.
- `git push` on this box hangs over HTTP/2 — always `git -c http.version=HTTP/1.1 push`.
- Only commit when explicitly asked; these tasks assume commits happen after each task per the
  chosen execution skill's normal flow.

---

### Task 1: Clear pending Change Queue rows

**Files:**
- Modify: `apps/web/app/api/v1/admin/staged-changes/route.ts`
- Modify: `apps/web/app/admin/changes/page.tsx`

**Interfaces:**
- Produces: `POST /api/v1/admin/staged-changes` accepts a new `{ action: 'clear' }` body (no `ids`
  required), returns `{ data: { cleared: number } }`.

- [ ] **Step 1: Add the `clear` action to the API route**

In `apps/web/app/api/v1/admin/staged-changes/route.ts`, the `POST` handler currently starts:

```ts
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { action, ids, overridePrice } = body as { action: 'approve' | 'reject'; ids: string[]; overridePrice?: number };

  if (!action || !['approve', 'reject'].includes(action) || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Body must include action (approve|reject) and non-empty ids array' } },
      { status: 400 },
    );
  }
```

Replace it with:

```ts
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { action, ids, overridePrice } = body as { action: 'approve' | 'reject' | 'clear'; ids?: string[]; overridePrice?: number };

  if (action === 'clear') {
    const { count } = await prisma.stagedPriceChange.deleteMany({ where: { status: 'PENDING' } });
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'staged_changes_cleared',
        entityType: 'staged_price_change',
        entityId: 'bulk',
        newValues: { count },
      },
    });
    return NextResponse.json({ data: { cleared: count } });
  }

  if (!action || !['approve', 'reject'].includes(action) || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Body must include action (approve|reject) and non-empty ids array' } },
      { status: 400 },
    );
  }
```

(Everything below that line — the `overridePrice` handling, the `updateMany`, the publish loop —
stays exactly as-is.)

- [ ] **Step 2: Add the "Clear pending" button to the Change Queue page**

In `apps/web/app/admin/changes/page.tsx`, add a new handler next to `handleAction` (both are defined
around line 80-100):

```ts
const clearPending = async () => {
  if (!confirm('Delete every PENDING staged change? This clears the queue across ALL vendors/tests, regardless of the tab you\'re viewing. Approved/rejected history is not affected.')) return;
  setActionError(null);
  const res = await fetch('/api/v1/admin/staged-changes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clear' }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    setActionError(j.error?.message ?? 'Could not clear the queue.');
    return;
  }
  fetchChanges();
};
```

Then in the JSX, find the tab bar:

```tsx
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`admin-btn admin-btn-sm ${tab === t ? '' : 'admin-btn-ghost'}`}
          >
            {t === 'All' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
        {selected.size > 0 && (
```

Add the clear button right after the `TABS.map(...)` block, before the `selected.size > 0` block:

```tsx
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`admin-btn admin-btn-sm ${tab === t ? '' : 'admin-btn-ghost'}`}
          >
            {t === 'All' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
        <button
          onClick={clearPending}
          className="admin-btn admin-btn-sm admin-btn-ghost"
          title="Delete every PENDING staged change, across all tabs"
        >
          Clear pending
        </button>
        {selected.size > 0 && (
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Against the dev server or live site (admin session): open `/admin/changes`, click "Clear pending",
confirm the dialog, verify the PENDING rows disappear and the page shows "No changes found" (or
only non-PENDING rows if you filter by another tab). Create a new pending change (e.g. re-scrape a
vendor) and confirm it's unaffected by a *previous* clear (i.e. clearing doesn't leave anything
broken for future rows).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/admin/staged-changes/route.ts apps/web/app/admin/changes/page.tsx
git commit -m "Add bulk-clear for pending Change Queue rows"
```

---

### Task 2: Auto-ignore panels end-to-end

**Files:**
- Modify: `packages/scrapers/src/catalog/persist.ts`
- Modify: `apps/web/app/api/v1/admin/discovered/route.ts`
- Modify: `apps/web/app/admin/discovered/page.tsx`
- Create: `apps/worker/scripts/ignore-existing-panels.ts`

**Interfaces:**
- Produces: `VendorProduct` rows with `isPanel: true` get `status: 'IGNORED'` (never `'UNMATCHED'`)
  as soon as `isPanel` is known — on first insert, or on a later crawl that reveals `isPanel: true`
  for a row still sitting at `status: 'UNMATCHED'`. Rows already `MATCHED` or `IGNORED` (admin-owned)
  are never touched, unchanged from today.

- [ ] **Step 1: Auto-ignore panels in the ingest matcher**

In `packages/scrapers/src/catalog/persist.ts`, find `decideMatch` inside `ingestVendorProducts`
(~line 517):

```ts
    const decideMatch = () => {
      if (offeringTestId) return { status: 'MATCHED' as const, testId: offeringTestId, matchedBy: 'offering', suggestedTestId: null };
      const m = autoMatch(d);
      if (m && 'testId' in m) { autoMatched++; return { status: 'MATCHED' as const, testId: m.testId, matchedBy: m.matchedBy, suggestedTestId: null }; }
      return { status: 'UNMATCHED' as const, testId: null, matchedBy: null, suggestedTestId: m && 'suggestedTestId' in m ? m.suggestedTestId : null };
    };
```

Replace with:

```ts
    const decideMatch = () => {
      if (offeringTestId) return { status: 'MATCHED' as const, testId: offeringTestId, matchedBy: 'offering', suggestedTestId: null };
      // Panels are excluded from matching/clustering entirely (product decision 2026-07-20) — auto-
      // ignore rather than leaving them UNMATCHED, so they never surface in the review queue.
      if (d.isPanel) return { status: 'IGNORED' as const, testId: null, matchedBy: null, suggestedTestId: null };
      const m = autoMatch(d);
      if (m && 'testId' in m) { autoMatched++; return { status: 'MATCHED' as const, testId: m.testId, matchedBy: m.matchedBy, suggestedTestId: null }; }
      return { status: 'UNMATCHED' as const, testId: null, matchedBy: null, suggestedTestId: m && 'suggestedTestId' in m ? m.suggestedTestId : null };
    };
```

This only runs for new rows (`!prior`) or rows still `status: 'UNMATCHED'` (see the surrounding
`if (!prior) { ... } else { const match = prior.status === 'UNMATCHED' ? decideMatch() : {}; ... }`)
— already-`MATCHED`/`IGNORED` rows are never re-touched, so this can't override an admin decision.

- [ ] **Step 2: Write the one-time backfill script**

Create `apps/worker/scripts/ignore-existing-panels.ts`:

```ts
// One-off: existing VendorProduct rows that are panels (isPanel: true) but still sitting at
// UNMATCHED from before the 2026-07-25 auto-ignore change. Run once after deploying that change;
// safe to re-run (idempotent — only touches rows still UNMATCHED).
import { prisma } from '@labprice/database';

async function main() {
  const result = await prisma.vendorProduct.updateMany({
    where: { isPanel: true, status: 'UNMATCHED' },
    data: { status: 'IGNORED' },
  });
  console.log(`Marked ${result.count} existing panel(s) as Ignored.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

- [ ] **Step 3: Remove the Panels tab from the Discovered API route**

In `apps/web/app/api/v1/admin/discovered/route.ts` GET, find:

```ts
  // Tab badge counts are always computed so the UI can show all four numbers regardless of view.
  const [unmatchedCount, matchedRows, panelCount, ignoredCount] = await Promise.all([
    prisma.vendorProduct.count({ where: { status: 'UNMATCHED', isPanel: false } }),
    prisma.vendorProduct.findMany({ where: { status: 'MATCHED' }, select: { id: true, testId: true, vendorId: true } }),
    prisma.vendorProduct.count({ where: { isPanel: true, status: { not: 'IGNORED' } } }),
    prisma.vendorProduct.count({ where: { status: 'IGNORED' } }),
  ]);
```

Replace with:

```ts
  // Tab badge counts are always computed so the UI can show all three numbers regardless of view.
  const [unmatchedCount, matchedRows, ignoredCount] = await Promise.all([
    prisma.vendorProduct.count({ where: { status: 'UNMATCHED', isPanel: false } }),
    prisma.vendorProduct.findMany({ where: { status: 'MATCHED' }, select: { id: true, testId: true, vendorId: true } }),
    prisma.vendorProduct.count({ where: { status: 'IGNORED' } }),
  ]);
```

A few lines down, find:

```ts
  const counts = {
    clusters: unmatchedCount,
    matched: unlistedMatchedIds.size,
    panels: panelCount,
    ignored: ignoredCount,
  };
```

Replace with:

```ts
  const counts = {
    clusters: unmatchedCount,
    matched: unlistedMatchedIds.size,
    ignored: ignoredCount,
  };
```

Further down, find:

```ts
  if (tab === 'panels' || tab === 'ignored') {
    const where: Prisma.VendorProductWhereInput = tab === 'panels'
      ? { isPanel: true, status: { not: 'IGNORED' }, ...searchWhere }
      : { status: 'IGNORED', ...searchWhere };
    const rows = await prisma.vendorProduct.findMany({ where, select: productSelect, orderBy: { name: 'asc' }, take: 500 });
    return NextResponse.json({ data: { counts, products: rows } });
  }
```

Replace with:

```ts
  if (tab === 'ignored') {
    const rows = await prisma.vendorProduct.findMany({
      where: { status: 'IGNORED', ...searchWhere },
      select: productSelect,
      orderBy: { name: 'asc' },
      take: 500,
    });
    return NextResponse.json({ data: { counts, products: rows } });
  }
```

Also update the module-level doc comment near the top of the file — find:

```ts
//   panels / ignored: excluded-by-decision and admin-dismissed rows, kept visible + restorable.
```

Replace with:

```ts
//   ignored: admin-dismissed rows (including auto-ignored panels), kept visible + restorable.
```

- [ ] **Step 4: Remove the Panels tab from the Discovered page UI**

In `apps/web/app/admin/discovered/page.tsx`, find:

```ts
type Counts = { clusters: number; matched: number; panels: number; ignored: number };
type Tab = 'clusters' | 'matched' | 'panels' | 'ignored';

const TABS: { key: Tab; label: string }[] = [
  { key: 'clusters', label: 'Discovered' },
  { key: 'matched', label: 'Matched, not listed' },
  { key: 'panels', label: 'Panels' },
  { key: 'ignored', label: 'Ignored' },
];
```

Replace with:

```ts
type Counts = { clusters: number; matched: number; ignored: number };
type Tab = 'clusters' | 'matched' | 'ignored';

const TABS: { key: Tab; label: string }[] = [
  { key: 'clusters', label: 'Discovered' },
  { key: 'matched', label: 'Matched, not listed' },
  { key: 'ignored', label: 'Ignored' },
];
```

Find:

```ts
  const [counts, setCounts] = useState<Counts>({ clusters: 0, matched: 0, panels: 0, ignored: 0 });
```

Replace with:

```ts
  const [counts, setCounts] = useState<Counts>({ clusters: 0, matched: 0, ignored: 0 });
```

Find (inside `load`):

```ts
      setCounts(json.data?.counts ?? { clusters: 0, matched: 0, panels: 0, ignored: 0 });
```

Replace with:

```ts
      setCounts(json.data?.counts ?? { clusters: 0, matched: 0, ignored: 0 });
```

Find the trailing branch of the `productTable` `extra` callback:

```ts
            if (tab === 'ignored') {
              return (
                <button className="admin-btn text-sm" disabled={busy} onClick={() => act({ action: 'restore', productIds: [p.id] }, 'Restored to review.')}>
                  Restore
                </button>
              );
            }
            return null; // panels: excluded by decision — display only
          })}
```

Replace with:

```ts
            if (tab === 'ignored') {
              return (
                <button className="admin-btn text-sm" disabled={busy} onClick={() => act({ action: 'restore', productIds: [p.id] }, 'Restored to review.')}>
                  Restore
                </button>
              );
            }
            return null;
          })}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the backfill against the target database**

Stop any running dev servers first (Windows Prisma lock gotcha). Then:

```bash
cd apps/worker && npx tsx scripts/ignore-existing-panels.ts
```

Expected output: `Marked N existing panel(s) as Ignored.` (N may be 0 if none were UNMATCHED).

- [ ] **Step 7: Manual verification**

Open `/admin/discovered`: confirm there is no "Panels" tab. Check the "Discovered" (clusters) tab —
no panel-named products (e.g. anything with "Panel"/"Profile"/"Package" in the name) should appear.
Check "Ignored" — panels should now show up there, each restorable via the existing Restore button.

- [ ] **Step 8: Commit**

```bash
git add packages/scrapers/src/catalog/persist.ts apps/web/app/api/v1/admin/discovered/route.ts apps/web/app/admin/discovered/page.tsx apps/worker/scripts/ignore-existing-panels.ts
git commit -m "Auto-ignore panels in Discovered instead of showing a dead-end tab"
```

---

### Task 3: Fix "Matched, not listed" tab content

**Files:**
- Modify: `apps/web/app/api/v1/admin/discovered/route.ts`

**Interfaces:**
- Produces: `GET /api/v1/admin/discovered?tab=matched` now returns only rows with no live offering
  yet — the table content matches `counts.matched` exactly.

- [ ] **Step 1: Filter the matched-tab query to the already-computed unlisted set**

In `apps/web/app/api/v1/admin/discovered/route.ts` GET, find:

```ts
  if (tab === 'matched') {
    const rows = await prisma.vendorProduct.findMany({
      where: { status: 'MATCHED', ...searchWhere },
      select: productSelect,
      orderBy: { lastSeenAt: 'desc' },
      take: 500,
    });
    return NextResponse.json({
      data: { counts, products: rows.map((r) => ({ ...r, hasOffering: !unlistedMatchedIds.has(r.id) })) },
    });
  }
```

Replace with:

```ts
  if (tab === 'matched') {
    const rows = await prisma.vendorProduct.findMany({
      where: { status: 'MATCHED', id: { in: [...unlistedMatchedIds] }, ...searchWhere },
      select: productSelect,
      orderBy: { lastSeenAt: 'desc' },
      take: 500,
    });
    // Every row here is, by the query above, already known to have no offering yet — hasOffering is
    // always false. Kept on the shape so the client's existing rendering logic doesn't need to change.
    return NextResponse.json({
      data: { counts, products: rows.map((r) => ({ ...r, hasOffering: false })) },
    });
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Open `/admin/discovered`, click "Matched, not listed". Confirm the number in the tab badge equals
the number of rows actually shown in the table, and every row shows the "List" button (none show
"listed ✓" — those are gone from this view now, exactly as the tab's name promises). Click "List" on
one row, confirm it disappears from this tab and the badge count decrements by 1.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/v1/admin/discovered/route.ts
git commit -m "Fix Matched-not-listed tab showing already-listed rows"
```

---

### Task 4: Checkbox selection on cluster Promote/Attach

**Files:**
- Modify: `apps/web/app/admin/discovered/page.tsx`

**Interfaces:**
- Produces: cluster cards get a checkbox per product row (default checked). Promote/Attach act only
  on checked rows; unchecked rows are set to `Ignored` via the existing `ignore` action.

- [ ] **Step 1: Add selection state**

In `apps/web/app/admin/discovered/page.tsx`, find the cluster-related state declarations:

```ts
  // Promote flow: modal prefilled from the cluster.
  const [promoteFor, setPromoteFor] = useState<Cluster | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [promoteForm, setPromoteForm] = useState({ name: '', shortName: '', categoryId: '', questCode: '', labcorpCode: '' });
```

Add a new state declaration right after it:

```ts
  // Row selection within a cluster card — unchecked rows get Ignored instead of promoted/attached.
  // Keyed by product id (globally unique), default empty (= everything checked).
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Add the combined ignore-then-act helper**

Find the existing `act` function:

```ts
  const act = async (payload: Record<string, unknown>, doneMsg: string) => {
```

Add a new function right after the closing of `act` (after its final `};`):

```ts
  // Used by Promote/Attach on a cluster: unchecked rows get Ignored first, then the checked rows go
  // through the requested action — as one busy/notice/reload cycle instead of two, so the notice
  // doesn't flash between an "ignored" message and the final one.
  const runIgnoreThenAction = async (
    action: 'promote' | 'attach',
    clusterProducts: ProductRow[],
    actionPayload: Record<string, unknown>,
    doneMsg: string,
  ) => {
    const included = clusterProducts.filter((p) => !excludedIds.has(p.id));
    const excluded = clusterProducts.filter((p) => excludedIds.has(p.id));
    if (included.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      if (excluded.length > 0) {
        await fetch('/api/v1/admin/discovered', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ignore', productIds: excluded.map((p) => p.id) }),
        });
      }
      const res = await fetch('/api/v1/admin/discovered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, productIds: included.map((p) => p.id), ...actionPayload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error?.message ?? 'Action failed.');
      } else {
        const dropped: { vendorId: string; name: string }[] = json.data?.droppedDuplicates ?? [];
        const parts = [doneMsg];
        if (excluded.length > 0) parts.push(`${excluded.length} unselected product(s) marked Ignored.`);
        if (dropped.length > 0) parts.push(`${dropped.length} product(s) skipped as same-vendor duplicates: ${dropped.map((d) => d.name).join(', ')}.`);
        setNotice(parts.join(' '));
        setExcludedIds((prev) => {
          const next = new Set(prev);
          for (const p of clusterProducts) next.delete(p.id);
          return next;
        });
        await load();
      }
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 3: Add the checkbox column to `productTable`**

Find:

```ts
  const productTable = (rows: ProductRow[], extra?: (p: ProductRow) => React.ReactNode) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
          <th className="p-2">Vendor</th>
          <th className="p-2">Vendor's name</th>
          <th className="p-2 text-right">Price</th>
          <th className="p-2">Codes</th>
          {extra && <th className="p-2" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-brand-50 last:border-0">
            <td className="p-2 text-brand-600">{p.vendor.name}</td>
            <td className="p-2">
              {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-brand-900 hover:text-brand-600 hover:underline">{p.name}</a> : <span className="text-brand-900">{p.name}</span>}
            </td>
            <td className="p-2 text-right text-brand-900">{money(p.price)}</td>
            <td className="p-2 font-mono text-xs text-brand-400">
              {[p.questCode && `Q ${p.questCode}`, p.labcorpCode && `LC ${p.labcorpCode}`].filter(Boolean).join(' · ') || '—'}
            </td>
            {extra && <td className="p-2 text-right">{extra(p)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
```

Replace with:

```ts
  const productTable = (rows: ProductRow[], extra?: (p: ProductRow) => React.ReactNode, selectable?: boolean) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
          {selectable && <th className="w-8 p-2" />}
          <th className="p-2">Vendor</th>
          <th className="p-2">Vendor's name</th>
          <th className="p-2 text-right">Price</th>
          <th className="p-2">Codes</th>
          {extra && <th className="p-2" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-brand-50 last:border-0">
            {selectable && (
              <td className="p-2">
                <input
                  type="checkbox"
                  checked={!excludedIds.has(p.id)}
                  onChange={() => setExcludedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    return next;
                  })}
                  title="Uncheck to leave this row out — it'll be marked Ignored instead of promoted/attached"
                />
              </td>
            )}
            <td className="p-2 text-brand-600">{p.vendor.name}</td>
            <td className="p-2">
              {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-brand-900 hover:text-brand-600 hover:underline">{p.name}</a> : <span className="text-brand-900">{p.name}</span>}
            </td>
            <td className="p-2 text-right text-brand-900">{money(p.price)}</td>
            <td className="p-2 font-mono text-xs text-brand-400">
              {[p.questCode && `Q ${p.questCode}`, p.labcorpCode && `LC ${p.labcorpCode}`].filter(Boolean).join(' · ') || '—'}
            </td>
            {extra && <td className="p-2 text-right">{extra(p)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
```

- [ ] **Step 4: Enable selection on cluster cards, and clarify the duplicate-vendor warning**

Find where clusters render their product table:

```tsx
                <div className="overflow-x-auto">{productTable(c.products)}</div>
```

Replace with:

```tsx
                <div className="overflow-x-auto">{productTable(c.products, undefined, true)}</div>
```

Find the duplicate-vendor warning text:

```tsx
                    {c.duplicateVendors.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700" title="Promoting/attaching the whole cluster only creates one offering per vendor — the other product from these vendors would be silently skipped.">
                        ⚠ {c.duplicateVendors.join(', ')} {c.duplicateVendors.length === 1 ? 'appears' : 'appear'} twice here — this cluster still mixes two different products. Check before promoting the whole thing.
                      </p>
                    )}
```

Replace with:

```tsx
                    {c.duplicateVendors.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        ⚠ {c.duplicateVendors.join(', ')} {c.duplicateVendors.length === 1 ? 'appears' : 'appear'} twice here — this cluster still mixes two different products. Uncheck the row(s) below that don't belong before promoting/attaching; unchecked rows are marked Ignored.
                      </p>
                    )}
```

- [ ] **Step 5: Wire the Promote button through `runIgnoreThenAction`, disable when nothing is selected**

Find the Promote modal's submit button:

```tsx
              <button
                className="admin-btn"
                disabled={busy || !promoteForm.name.trim() || !promoteForm.categoryId}
                onClick={async () => {
                  await act(
                    {
                      action: 'promote',
                      productIds: promoteFor.products.map((p) => p.id),
                      name: promoteForm.name,
                      shortName: promoteForm.shortName,
                      categoryId: promoteForm.categoryId,
                      questCode: promoteForm.questCode,
                      labcorpCode: promoteForm.labcorpCode,
                    },
                    `Created ${promoteForm.name} and listed ${promoteFor.products.length} offering(s).`,
                  );
                  setPromoteFor(null);
                }}
              >
                {busy ? 'Creating…' : 'Create test'}
              </button>
```

Replace with:

```tsx
              <button
                className="admin-btn"
                disabled={busy || !promoteForm.name.trim() || !promoteForm.categoryId || promoteFor.products.every((p) => excludedIds.has(p.id))}
                onClick={async () => {
                  const includedCount = promoteFor.products.filter((p) => !excludedIds.has(p.id)).length;
                  await runIgnoreThenAction(
                    'promote',
                    promoteFor.products,
                    {
                      name: promoteForm.name,
                      shortName: promoteForm.shortName,
                      categoryId: promoteForm.categoryId,
                      questCode: promoteForm.questCode,
                      labcorpCode: promoteForm.labcorpCode,
                    },
                    `Created ${promoteForm.name} and listed ${includedCount} offering(s).`,
                  );
                  setPromoteFor(null);
                }}
              >
                {busy ? 'Creating…' : 'Create test'}
              </button>
```

- [ ] **Step 6: Also add the checkbox table to the Promote modal so selection is visible there**

Find the Promote modal's intro paragraph:

```tsx
            <p className="mb-3 text-sm text-brand-400">
              Creates the test and lists {promoteFor.products.length} vendor offering(s) with their
              observed prices. Copy/details can be filled afterwards in the test editor (✨ Auto-fill).
            </p>
```

Replace with:

```tsx
            <p className="mb-3 text-sm text-brand-400">
              Creates the test and lists the checked vendor offering(s) below with their observed
              prices. Unchecked rows are marked Ignored instead. Copy/details can be filled
              afterwards in the test editor (✨ Auto-fill).
            </p>
            <div className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-brand-100">
              {productTable(promoteFor.products, undefined, true)}
            </div>
```

- [ ] **Step 7: Wire the Attach button through `runIgnoreThenAction`, and show the same checkbox table**

Find the Attach modal:

```tsx
      {attachFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAttachFor(null)}>
          <div className="admin-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-h2 mb-1">Attach "{attachFor.name}"</h2>
            <p className="mb-3 text-sm text-brand-400">
              Links {attachFor.products.length} vendor product(s) to an existing test, creates the
              offerings, and learns the vendors' names as aliases.
            </p>
            <input autoFocus type="text" className="admin-input mb-2 w-full" placeholder="Search your tests…" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} />
            <div className="mb-4 max-h-56 overflow-y-auto">
              {testResults.map((t) => (
                <button
                  key={t.id}
                  className="block w-full rounded px-3 py-2 text-left text-sm text-brand-900 hover:bg-brand-50"
                  disabled={busy}
                  onClick={async () => {
                    await act({ action: 'attach', productIds: attachFor.products.map((p) => p.id), testId: t.id }, `Attached to ${t.name}.`);
                    setAttachFor(null);
                  }}
                >
                  {t.name}
                </button>
              ))}
              {testResults.length === 0 && <p className="px-3 py-2 text-sm text-brand-400">No tests match.</p>}
            </div>
            <div className="flex justify-end">
              <button className="admin-btn" onClick={() => setAttachFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
```

Replace with:

```tsx
      {attachFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAttachFor(null)}>
          <div className="admin-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-h2 mb-1">Attach "{attachFor.name}"</h2>
            <p className="mb-3 text-sm text-brand-400">
              Links the checked vendor product(s) below to an existing test, creates the offerings,
              and learns the vendors' names as aliases. Unchecked rows are marked Ignored instead.
            </p>
            <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-brand-100">
              {productTable(attachFor.products, undefined, true)}
            </div>
            <input autoFocus type="text" className="admin-input mb-2 w-full" placeholder="Search your tests…" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} />
            <div className="mb-4 max-h-56 overflow-y-auto">
              {testResults.map((t) => (
                <button
                  key={t.id}
                  className="block w-full rounded px-3 py-2 text-left text-sm text-brand-900 hover:bg-brand-50 disabled:opacity-50"
                  disabled={busy || attachFor.products.every((p) => excludedIds.has(p.id))}
                  onClick={async () => {
                    await runIgnoreThenAction('attach', attachFor.products, { testId: t.id }, `Attached to ${t.name}.`);
                    setAttachFor(null);
                  }}
                >
                  {t.name}
                </button>
              ))}
              {testResults.length === 0 && <p className="px-3 py-2 text-sm text-brand-400">No tests match.</p>}
            </div>
            <div className="flex justify-end">
              <button className="admin-btn" onClick={() => setAttachFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 8: Clear stale selection state when opening a fresh cluster's modal**

Find `openPromote`:

```ts
  const openPromote = (c: Cluster) => {
    setPromoteFor(c);
    setPromoteForm({
      name: c.name,
      shortName: '',
      categoryId: '',
      questCode: c.questCode ?? '',
      labcorpCode: c.labcorpCode ?? '',
    });
  };
```

Replace with:

```ts
  const openPromote = (c: Cluster) => {
    setPromoteFor(c);
    setExcludedIds(new Set());
    setPromoteForm({
      name: c.name,
      shortName: '',
      categoryId: '',
      questCode: c.questCode ?? '',
      labcorpCode: c.labcorpCode ?? '',
    });
  };
```

Find where the Attach modal is opened (the cluster card's "Attach to existing…" button):

```tsx
                    <button
                      className="admin-btn text-sm"
                      disabled={busy}
                      onClick={() => { setAttachFor(c); setTestQuery(c.suggestedTest?.name ?? c.name); }}
                    >
                      Attach to existing…
                    </button>
```

Replace with:

```tsx
                    <button
                      className="admin-btn text-sm"
                      disabled={busy}
                      onClick={() => { setAttachFor(c); setExcludedIds(new Set()); setTestQuery(c.suggestedTest?.name ?? c.name); }}
                    >
                      Attach to existing…
                    </button>
```

- [ ] **Step 9: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Manual verification**

Open `/admin/discovered`, find a cluster with a same-vendor duplicate warning (or any cluster).
Uncheck one row, click "Promote to test" (or "Attach to existing…" and pick a test) — confirm the
notice mentions both the created/attached count and the "N unselected product(s) marked Ignored"
count, and that the unchecked row shows up under the "Ignored" tab afterward while the checked
row(s) got their offering created. Confirm the action button disables when every row is unchecked.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/admin/discovered/page.tsx
git commit -m "Add checkbox row selection to Discovered Promote/Attach"
```

---

### Task 5: Pure dual-lab price ranking function + tests

**Files:**
- Create: `packages/scrapers/src/catalog/dual-lab-pricing.ts`
- Create: `packages/scrapers/src/__tests__/dual-lab-pricing.test.ts`

**Interfaces:**
- Produces: `rankDualLabPrices(questPrice: number | null, labcorpPrice: number | null): DualLabRanking`
  where `DualLabRanking = { currentPrice: number | null; labProvider: 'quest' | 'labcorp' | null;
  altLabPrice: number | null; altLabProvider: 'quest' | 'labcorp' | null }`. Cheaper lab wins as
  primary; ties go to Quest. Used by Task 7's `publishStagedChange`.

- [ ] **Step 1: Write the failing test**

Create `packages/scrapers/src/__tests__/dual-lab-pricing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rankDualLabPrices } from '../catalog/dual-lab-pricing';

describe('rankDualLabPrices', () => {
  it('ranks quest as primary when cheaper', () => {
    expect(rankDualLabPrices(45, 60)).toEqual({
      currentPrice: 45, labProvider: 'quest', altLabPrice: 60, altLabProvider: 'labcorp',
    });
  });

  it('ranks labcorp as primary when cheaper', () => {
    expect(rankDualLabPrices(65, 55)).toEqual({
      currentPrice: 55, labProvider: 'labcorp', altLabPrice: 65, altLabProvider: 'quest',
    });
  });

  it('ties go to quest', () => {
    expect(rankDualLabPrices(50, 50)).toEqual({
      currentPrice: 50, labProvider: 'quest', altLabPrice: 50, altLabProvider: 'labcorp',
    });
  });

  it('only quest priced', () => {
    expect(rankDualLabPrices(50, null)).toEqual({
      currentPrice: 50, labProvider: 'quest', altLabPrice: null, altLabProvider: null,
    });
  });

  it('only labcorp priced', () => {
    expect(rankDualLabPrices(null, 50)).toEqual({
      currentPrice: 50, labProvider: 'labcorp', altLabPrice: null, altLabProvider: null,
    });
  });

  it('neither priced', () => {
    expect(rankDualLabPrices(null, null)).toEqual({
      currentPrice: null, labProvider: null, altLabPrice: null, altLabProvider: null,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/scrapers && npx vitest run src/__tests__/dual-lab-pricing.test.ts`
Expected: FAIL — `Failed to resolve import "../catalog/dual-lab-pricing"`.

- [ ] **Step 3: Implement `rankDualLabPrices`**

Create `packages/scrapers/src/catalog/dual-lab-pricing.ts`:

```ts
// Pure ranking logic for mergeCodeTiers vendors (currently only Dirt Cheap Labs) that sell the same
// test through both Quest and LabCorp at independent prices. Kept separate from persist.ts (which
// touches Prisma/the DB) so this business rule stays unit-testable without a live database — same
// reasoning as catalog/matcher.ts.

export interface DualLabRanking {
  currentPrice: number | null;
  labProvider: 'quest' | 'labcorp' | null;
  altLabPrice: number | null;
  altLabProvider: 'quest' | 'labcorp' | null;
}

/**
 * Cheaper lab becomes primary (currentPrice/labProvider), pricier becomes the secondary "alt"
 * option — mirrors matchTestToProducts' mergeCodeTiers cheapest-wins rule. Ties go to Quest.
 */
export function rankDualLabPrices(questPrice: number | null, labcorpPrice: number | null): DualLabRanking {
  if (questPrice != null && labcorpPrice != null) {
    return questPrice <= labcorpPrice
      ? { currentPrice: questPrice, labProvider: 'quest', altLabPrice: labcorpPrice, altLabProvider: 'labcorp' }
      : { currentPrice: labcorpPrice, labProvider: 'labcorp', altLabPrice: questPrice, altLabProvider: 'quest' };
  }
  if (questPrice != null) return { currentPrice: questPrice, labProvider: 'quest', altLabPrice: null, altLabProvider: null };
  if (labcorpPrice != null) return { currentPrice: labcorpPrice, labProvider: 'labcorp', altLabPrice: null, altLabProvider: null };
  return { currentPrice: null, labProvider: null, altLabPrice: null, altLabProvider: null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/scrapers && npx vitest run src/__tests__/dual-lab-pricing.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/scrapers/src/catalog/dual-lab-pricing.ts packages/scrapers/src/__tests__/dual-lab-pricing.test.ts
git commit -m "Add pure ranking function for dual-lab (Quest/LabCorp) pricing"
```

---

### Task 6: Dual-lab schema migration + backfill

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `apps/worker/scripts/backfill-dual-lab-prices.ts`

**Interfaces:**
- Produces: `Offering.questPrice` / `questPreviousPrice` / `labcorpPrice` / `labcorpPreviousPrice`
  (all `Decimal? @db.Decimal(10, 2)`), `StagedPriceChange.labProvider` (`String?`), and
  `PriceHistory.labProvider` (`String?`) — all nullable, all null for every non-dual-lab vendor
  (zero behavior change for anything but Dirt Cheap Labs). Consumed by Task 7.

- [ ] **Step 1: Add the new Offering fields**

In `packages/database/prisma/schema.prisma`, find the `Offering` model's lab-price block:

```prisma
  labProvider    String?   @map("lab_provider")
  altLabPrice    Decimal?  @map("alt_lab_price") @db.Decimal(10, 2)
  altLabProvider String?   @map("alt_lab_provider")
  priceUpdatedAt DateTime? @map("price_updated_at")
```

Replace with:

```prisma
  labProvider    String?   @map("lab_provider")
  altLabPrice    Decimal?  @map("alt_lab_price") @db.Decimal(10, 2)
  altLabProvider String?   @map("alt_lab_provider")
  // Stable per-lab prices for mergeCodeTiers vendors (currently only Dirt Cheap Labs) — populated
  // independently of which lab is cheaper. currentPrice/labProvider/altLabPrice/altLabProvider above
  // remain a DERIVED cheaper/pricier ranking, recomputed from these two whenever either publishes
  // (see rankDualLabPrices in packages/scrapers/src/catalog/dual-lab-pricing.ts) — every other reader
  // of Offering (public site, sitemap, CSV export/import, trends) needs no changes. Null for every
  // non-dual-lab vendor.
  questPrice           Decimal? @map("quest_price") @db.Decimal(10, 2)
  questPreviousPrice   Decimal? @map("quest_previous_price") @db.Decimal(10, 2)
  labcorpPrice         Decimal? @map("labcorp_price") @db.Decimal(10, 2)
  labcorpPreviousPrice Decimal? @map("labcorp_previous_price") @db.Decimal(10, 2)
  priceUpdatedAt DateTime? @map("price_updated_at")
```

- [ ] **Step 2: Add `StagedPriceChange.labProvider`**

Find:

```prisma
  status       ChangeStatus @default(PENDING)
  reviewedById String?      @map("reviewed_by")
  reviewedAt   DateTime?    @map("reviewed_at")
  reviewNote   String?      @map("review_note")
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")
```

Replace with:

```prisma
  status       ChangeStatus @default(PENDING)
  reviewedById String?      @map("reviewed_by")
  reviewedAt   DateTime?    @map("reviewed_at")
  reviewNote   String?      @map("review_note")
  // Which lab this staged change is for, when the offering is priced through multiple labs
  // (mergeCodeTiers vendors, e.g. Dirt Cheap Labs). Null for every ordinary single-price vendor —
  // unchanged behavior.
  labProvider  String?      @map("lab_provider")
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")
```

- [ ] **Step 3: Add `PriceHistory.labProvider`**

Find:

```prisma
  observedAt  DateTime    @map("observed_at")
  source      PriceSource
  scrapeRunId String?     @map("scrape_run_id")
  createdAt   DateTime    @default(now()) @map("created_at")
```

Replace with:

```prisma
  observedAt  DateTime    @map("observed_at")
  source      PriceSource
  scrapeRunId String?     @map("scrape_run_id")
  // Mirrors StagedPriceChange.labProvider — which lab this observation is for, when applicable. Null
  // for every ordinary single-price vendor.
  labProvider String?     @map("lab_provider")
  createdAt   DateTime    @default(now()) @map("created_at")
```

- [ ] **Step 4: Push the schema**

Stop any running dev servers first (Windows Prisma-generate lock — `.claude/CLAUDE.md` gotcha #3).
Then:

```bash
pnpm --filter @labprice/database db:push
```

Expected: prints the diff (4 new columns on `offerings`, 1 new column on `staged_price_changes`, 1
new column on `price_history`) and completes without error.

- [ ] **Step 5: Write the backfill script**

Create `apps/worker/scripts/backfill-dual-lab-prices.ts`:

```ts
// One-off: backfill Offering.questPrice/labcorpPrice from the existing currentPrice/labProvider/
// altLabPrice/altLabProvider on Dirt Cheap Labs offerings, ahead of the dual-lab Change Queue
// staging change (2026-07-25). Run once after `db:push`. Safe to re-run (idempotent — recomputes
// from the same source fields each time).
import { prisma } from '@labprice/database';

async function main() {
  const vendor = await prisma.vendor.findFirst({ where: { slug: 'dirtcheaplabs' } });
  if (!vendor) {
    console.log('No dirtcheaplabs vendor found — nothing to backfill.');
    return;
  }

  const offerings = await prisma.offering.findMany({
    where: { vendorId: vendor.id, currentPrice: { not: null } },
    select: { id: true, currentPrice: true, labProvider: true, altLabPrice: true, altLabProvider: true },
  });

  let updated = 0;
  for (const o of offerings) {
    const questPrice = o.labProvider === 'quest' ? o.currentPrice : o.altLabProvider === 'quest' ? o.altLabPrice : null;
    const labcorpPrice = o.labProvider === 'labcorp' ? o.currentPrice : o.altLabProvider === 'labcorp' ? o.altLabPrice : null;
    if (questPrice == null && labcorpPrice == null) continue;
    await prisma.offering.update({ where: { id: o.id }, data: { questPrice, labcorpPrice } });
    updated++;
  }
  console.log(`Backfilled ${updated}/${offerings.length} Dirt Cheap Labs offering(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

- [ ] **Step 6: Run the backfill**

```bash
cd apps/worker && npx tsx scripts/backfill-dual-lab-prices.ts
```

Expected: `Backfilled N/M Dirt Cheap Labs offering(s).`

- [ ] **Step 7: Verify in Prisma Studio (optional but recommended)**

```bash
pnpm --filter @labprice/database db:studio
```

Open the `offerings` table, filter to the Dirt Cheap Labs vendor, spot-check a few rows: `questPrice`
and/or `labcorpPrice` should be populated consistent with the existing `labProvider`/`altLabProvider`
values.

- [ ] **Step 8: Commit**

```bash
git add packages/database/prisma/schema.prisma apps/worker/scripts/backfill-dual-lab-prices.ts
git commit -m "Add dual-lab price schema fields + backfill for Dirt Cheap Labs"
```

---

### Task 7: Scraper staging + publish for dual-lab pricing

**Files:**
- Modify: `packages/scrapers/src/catalog/persist.ts`

**Interfaces:**
- Consumes: `rankDualLabPrices` from `./dual-lab-pricing` (Task 5); `Offering.questPrice` /
  `questPreviousPrice` / `labcorpPrice` / `labcorpPreviousPrice` and `StagedPriceChange.labProvider`
  / `PriceHistory.labProvider` (Task 6).
- Produces: for `mergeCodeTiers` vendors, each lab whose price changed gets its own
  `StagedPriceChange` (tagged `labProvider`), auto-approved independently. `publishStagedChange`
  writes a lab-tagged change to that lab's field and recomputes the derived
  `currentPrice`/`labProvider`/`altLabPrice`/`altLabProvider` ranking. Every other vendor's flow is
  byte-for-byte unchanged.

- [ ] **Step 1: Import the ranking function**

In `packages/scrapers/src/catalog/persist.ts`, find the import block near the top:

```ts
import { matchTestToProducts, nameMatches, normalizeName, sharesStrongToken, testNames } from './matcher';
import type { CatalogEntry, CatalogProduct, MatchTier, TestKey } from './types';
```

Add a new import line after it:

```ts
import { matchTestToProducts, nameMatches, normalizeName, sharesStrongToken, testNames } from './matcher';
import { rankDualLabPrices } from './dual-lab-pricing';
import type { CatalogEntry, CatalogProduct, MatchTier, TestKey } from './types';
```

- [ ] **Step 2: Replace the matched-branch write logic to stage per-lab changes**

Find the full "matched" block in `runVendorDiscovery` (it starts right after the `ambiguous` block's
`continue;`):

```ts
    // matched
    summary.matched++;
    // Store the product URL + member price (secondary info, updated live — not subject to the Change
    // Queue, which governs only the compared non-member currentPrice). lastCheckedAt is stamped on
    // EVERY match — an unchanged price is still a verified price, and the site's "checked N ago"
    // freshness reads it (priceUpdatedAt only moves on a change).
    // labProvider/altLab* are set unconditionally (not `if present`, unlike externalUrl/memberPrice
    // above) so a lab that stops carrying this test clears its stale alt price next scrape instead
    // of leaving a phantom "also available at $X" forever.
    const offeringUpdate: Record<string, unknown> = {
      lastCheckedAt: new Date(),
      labProvider: result.provider ?? null,
      altLabPrice: result.altPrice != null ? new Decimal(result.altPrice) : null,
      altLabProvider: result.altProvider ?? null,
    };
    if (result.sourceUrl && result.sourceUrl !== offering.externalUrl) offeringUpdate.externalUrl = result.sourceUrl;
    if (result.memberPrice != null) offeringUpdate.memberPrice = new Decimal(result.memberPrice);
    await prisma.offering.update({ where: { id: offering.id }, data: offeringUpdate });
    const price = new Decimal(result.price!);
    const priceChanged = !offering.currentPrice || !price.equals(offering.currentPrice);
    await prisma.scrapeResult.create({
      data: { runId: run.id, testId: test.id, status: priceChanged ? 'PRICE_CHANGED' : 'PRICE_SAME', matchedOfferingId: offering.id, scrapedPrice: price },
    });
    if (priceChanged) {
      pricesChanged++;
      const autoApprove = shouldAutoApprove(offering.currentPrice, price, trust, settings.autoApproveDecreasePercent, settings.autoApproveIncreasePercent);
      const staged = await prisma.stagedPriceChange.create({
        data: {
          offeringId: offering.id, oldPrice: offering.currentPrice, newPrice: price, scrapedAt: new Date(),
          scrapeRunId: run.id, status: autoApprove ? 'AUTO_APPROVED' : 'PENDING',
          reviewNote: `Matched by ${result.matchedBy} → ${result.provider} @ ${result.sourceUrl}`,
        },
      });
      summary.staged++;
      if (autoApprove) summary.autoApprovedStagedIds.push(staged.id);
    }
  }
```

Replace the entire block with:

```ts
    // matched
    summary.matched++;
    const isMergeCodeTiers = !!cfg.matchOptions?.mergeCodeTiers;

    // Store the product URL + member price (secondary info, updated live — not subject to the Change
    // Queue). lastCheckedAt is stamped on EVERY match — an unchanged price is still a verified price,
    // and the site's "checked N ago" freshness reads it (priceUpdatedAt only moves on a change).
    const offeringUpdate: Record<string, unknown> = { lastCheckedAt: new Date() };
    if (result.sourceUrl && result.sourceUrl !== offering.externalUrl) offeringUpdate.externalUrl = result.sourceUrl;
    if (result.memberPrice != null) offeringUpdate.memberPrice = new Decimal(result.memberPrice);

    if (isMergeCodeTiers) {
      // Dirt Cheap Labs-style vendors: result.provider/price is the cheaper lab this scrape,
      // result.altProvider/altPrice the pricier lab (if it also carries the test). Derive each lab's
      // own price from those, and stage/compare per lab — currentPrice/altLabPrice are now a DERIVED
      // ranking only recomputed on publish (see the `else` branch of publishStagedChange below), so
      // they're intentionally NOT written here.
      const questPrice = result.provider === 'quest' ? result.price : result.altProvider === 'quest' ? result.altPrice : null;
      const labcorpPrice = result.provider === 'labcorp' ? result.price : result.altProvider === 'labcorp' ? result.altPrice : null;

      for (const [lab, newRaw, priceField] of [
        ['quest', questPrice, 'questPrice'],
        ['labcorp', labcorpPrice, 'labcorpPrice'],
      ] as const) {
        const existingPrice = offering[priceField];
        if (newRaw == null) {
          // This lab no longer carries the test — clear it directly, no review (same as the old
          // unconditional altLabPrice-clearing behavior, just per-field now).
          if (existingPrice != null) offeringUpdate[priceField] = null;
          continue;
        }
        const newPrice = new Decimal(newRaw);
        if (existingPrice != null && newPrice.equals(existingPrice)) continue; // unchanged, nothing to stage
        pricesChanged++;
        const autoApprove = shouldAutoApprove(existingPrice, newPrice, trust, settings.autoApproveDecreasePercent, settings.autoApproveIncreasePercent);
        const staged = await prisma.stagedPriceChange.create({
          data: {
            offeringId: offering.id, oldPrice: existingPrice, newPrice, scrapedAt: new Date(),
            scrapeRunId: run.id, status: autoApprove ? 'AUTO_APPROVED' : 'PENDING', labProvider: lab,
            reviewNote: `Matched by ${result.matchedBy} → ${lab} @ ${result.sourceUrl}`,
          },
        });
        summary.staged++;
        if (autoApprove) summary.autoApprovedStagedIds.push(staged.id);
      }

      await prisma.scrapeResult.create({
        data: {
          runId: run.id, testId: test.id, status: 'PRICE_SAME', matchedOfferingId: offering.id,
          scrapedPrice: questPrice != null ? new Decimal(questPrice) : labcorpPrice != null ? new Decimal(labcorpPrice) : null,
        },
      });
      await prisma.offering.update({ where: { id: offering.id }, data: offeringUpdate });
      continue;
    }

    // Non-mergeCodeTiers: unchanged single-price flow.
    offeringUpdate.labProvider = result.provider ?? null;
    offeringUpdate.altLabPrice = result.altPrice != null ? new Decimal(result.altPrice) : null;
    offeringUpdate.altLabProvider = result.altProvider ?? null;
    await prisma.offering.update({ where: { id: offering.id }, data: offeringUpdate });
    const price = new Decimal(result.price!);
    const priceChanged = !offering.currentPrice || !price.equals(offering.currentPrice);
    await prisma.scrapeResult.create({
      data: { runId: run.id, testId: test.id, status: priceChanged ? 'PRICE_CHANGED' : 'PRICE_SAME', matchedOfferingId: offering.id, scrapedPrice: price },
    });
    if (priceChanged) {
      pricesChanged++;
      const autoApprove = shouldAutoApprove(offering.currentPrice, price, trust, settings.autoApproveDecreasePercent, settings.autoApproveIncreasePercent);
      const staged = await prisma.stagedPriceChange.create({
        data: {
          offeringId: offering.id, oldPrice: offering.currentPrice, newPrice: price, scrapedAt: new Date(),
          scrapeRunId: run.id, status: autoApprove ? 'AUTO_APPROVED' : 'PENDING',
          reviewNote: `Matched by ${result.matchedBy} → ${result.provider} @ ${result.sourceUrl}`,
        },
      });
      summary.staged++;
      if (autoApprove) summary.autoApprovedStagedIds.push(staged.id);
    }
  }
```

Note: `offering[priceField]` above is intentionally loosely typed (the surrounding `offerings` query
uses a Prisma `include`, not `select`, so every scalar field — including the new `questPrice`/
`labcorpPrice` from Task 6 — is already present on each `offering` object with no query change
needed).

- [ ] **Step 3: Update `publishStagedChange` to handle lab-tagged changes**

Find the current `publishStagedChange` (already wrapped in `$transaction` with an atomic claim from
an earlier bug-fix pass):

```ts
export async function publishStagedChange(stagedChangeId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const staged = await tx.stagedPriceChange.findUnique({ where: { id: stagedChangeId } });
    if (!staged || (staged.status !== 'APPROVED' && staged.status !== 'AUTO_APPROVED')) return false;

    // Claim the row atomically (status filter in the WHERE, not just the read above) so two
    // concurrent publish calls for the same staged change can't both pass the check and double-write
    // price history / the audit log.
    const claimed = await tx.stagedPriceChange.updateMany({
      where: { id: stagedChangeId, status: staged.status },
      data: { reviewedAt: new Date() },
    });
    if (claimed.count === 0) return false;

    await tx.offering.update({
      where: { id: staged.offeringId },
      data: { previousPrice: staged.oldPrice, currentPrice: staged.newPrice, priceUpdatedAt: new Date(), lastCheckedAt: new Date() },
    });
    await tx.priceHistory.create({
      data: { offeringId: staged.offeringId, oldPrice: staged.oldPrice, newPrice: staged.newPrice, observedAt: staged.scrapedAt, source: 'SCRAPE', scrapeRunId: staged.scrapeRunId },
    });
    await tx.auditLog.create({
      data: {
        action: 'price_published',
        entityType: 'offering',
        entityId: staged.offeringId,
        oldValues: { price: staged.oldPrice?.toString() ?? null },
        newValues: { price: staged.newPrice.toString() },
      },
    });
    return true;
  });
}
```

Replace with:

```ts
export async function publishStagedChange(stagedChangeId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const staged = await tx.stagedPriceChange.findUnique({ where: { id: stagedChangeId } });
    if (!staged || (staged.status !== 'APPROVED' && staged.status !== 'AUTO_APPROVED')) return false;

    // Claim the row atomically (status filter in the WHERE, not just the read above) so two
    // concurrent publish calls for the same staged change can't both pass the check and double-write
    // price history / the audit log.
    const claimed = await tx.stagedPriceChange.updateMany({
      where: { id: stagedChangeId, status: staged.status },
      data: { reviewedAt: new Date() },
    });
    if (claimed.count === 0) return false;

    if (staged.labProvider === 'quest' || staged.labProvider === 'labcorp') {
      // Dual-lab (mergeCodeTiers) change: write the specific lab's field, then recompute the
      // derived cheaper/pricier ranking from BOTH labs' current prices — so currentPrice/labProvider/
      // altLabPrice/altLabProvider (read everywhere else in the app) reflect the latest APPROVED
      // price for each lab, not whichever lab happened to be cheaper mid-review.
      const offering = await tx.offering.findUnique({
        where: { id: staged.offeringId },
        select: { questPrice: true, labcorpPrice: true },
      });
      const newPriceNum = staged.newPrice.toNumber();
      const questPrice = staged.labProvider === 'quest' ? newPriceNum : offering?.questPrice?.toNumber() ?? null;
      const labcorpPrice = staged.labProvider === 'labcorp' ? newPriceNum : offering?.labcorpPrice?.toNumber() ?? null;
      const ranked = rankDualLabPrices(questPrice, labcorpPrice);

      await tx.offering.update({
        where: { id: staged.offeringId },
        data: {
          ...(staged.labProvider === 'quest'
            ? { questPrice: staged.newPrice, questPreviousPrice: staged.oldPrice }
            : { labcorpPrice: staged.newPrice, labcorpPreviousPrice: staged.oldPrice }),
          currentPrice: ranked.currentPrice != null ? new Decimal(ranked.currentPrice) : null,
          labProvider: ranked.labProvider,
          altLabPrice: ranked.altLabPrice != null ? new Decimal(ranked.altLabPrice) : null,
          altLabProvider: ranked.altLabProvider,
          priceUpdatedAt: new Date(),
          lastCheckedAt: new Date(),
        },
      });
    } else {
      await tx.offering.update({
        where: { id: staged.offeringId },
        data: { previousPrice: staged.oldPrice, currentPrice: staged.newPrice, priceUpdatedAt: new Date(), lastCheckedAt: new Date() },
      });
    }

    await tx.priceHistory.create({
      data: {
        offeringId: staged.offeringId, oldPrice: staged.oldPrice, newPrice: staged.newPrice,
        observedAt: staged.scrapedAt, source: 'SCRAPE', scrapeRunId: staged.scrapeRunId,
        labProvider: staged.labProvider,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'price_published',
        entityType: 'offering',
        entityId: staged.offeringId,
        oldValues: { price: staged.oldPrice?.toString() ?? null, labProvider: staged.labProvider },
        newValues: { price: staged.newPrice.toString(), labProvider: staged.labProvider },
      },
    });
    return true;
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/scrapers && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full scraper test suite**

Run: `cd packages/scrapers && npx vitest run`
Expected: all existing tests still pass (this change doesn't touch matcher.ts or any parser), plus
the 6 `dual-lab-pricing.test.ts` tests from Task 5.

- [ ] **Step 6: Manual verification against Dirt Cheap Labs**

Against the dev server or live site: trigger a "Scrape now" for the Dirt Cheap Labs vendor (or run
the worker's discovery job for it). Confirm in `/admin/changes` that a test priced through both
labs produces up to two separate staged-change rows for the same test/vendor (one per lab that
changed), each independently approvable/rejectable. Approve one, confirm the offering's public-
facing price updates correctly and (if the other lab is cheaper) the "also available via X" price
still shows correctly on the test's public page.

- [ ] **Step 7: Commit**

```bash
git add packages/scrapers/src/catalog/persist.ts
git commit -m "Stage and publish Dirt Cheap Labs' Quest/LabCorp prices independently"
```

---

### Task 8: Change Queue UI — lab badge

**Files:**
- Modify: `apps/web/app/admin/changes/page.tsx`

**Interfaces:**
- Consumes: `StagedPriceChange.labProvider` from Task 6/7, already returned by the existing
  `GET /api/v1/admin/staged-changes` (it uses `include`, not `select`, so no route change needed).

- [ ] **Step 1: Add `labProvider` to the `Change` type**

Find:

```ts
type Change = {
  id: string;
  oldPrice: string | null;
  newPrice: string;
  status: string;
  createdAt: string;
  offering: {
    id: string;
    externalUrl: string | null;
    test: { id: string; name: string };
    vendor: { id: string; name: string; websiteUrl: string | null };
  };
};
```

Replace with:

```ts
type Change = {
  id: string;
  oldPrice: string | null;
  newPrice: string;
  status: string;
  createdAt: string;
  labProvider: 'quest' | 'labcorp' | null;
  offering: {
    id: string;
    externalUrl: string | null;
    test: { id: string; name: string };
    vendor: { id: string; name: string; websiteUrl: string | null };
  };
};
```

- [ ] **Step 2: Render the badge next to the vendor name**

Find the vendor cell:

```tsx
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {c.offering.externalUrl || c.offering.vendor.websiteUrl ? (
                          <a
                            href={(c.offering.externalUrl ?? c.offering.vendor.websiteUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 underline decoration-dotted underline-offset-2 hover:text-brand-800"
                            title="Open the vendor's page for this test to verify the price"
                          >
                            {c.offering.vendor.name} ↗
                          </a>
                        ) : (
                          <span className="text-brand-600">{c.offering.vendor.name}</span>
                        )}
                        <button
                          onClick={() => { setEditingUrl(c.id); setUrlDrafts((d) => ({ ...d, [c.id]: c.offering.externalUrl ?? '' })); }}
                          className="text-xs text-brand-300 hover:text-brand-600"
                          title="Fix this vendor's product URL — independent of approving/rejecting the price"
                        >
                          ✎
                        </button>
                      </div>
```

Replace with:

```tsx
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {c.offering.externalUrl || c.offering.vendor.websiteUrl ? (
                          <a
                            href={(c.offering.externalUrl ?? c.offering.vendor.websiteUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 underline decoration-dotted underline-offset-2 hover:text-brand-800"
                            title="Open the vendor's page for this test to verify the price"
                          >
                            {c.offering.vendor.name} ↗
                          </a>
                        ) : (
                          <span className="text-brand-600">{c.offering.vendor.name}</span>
                        )}
                        {c.labProvider && (
                          <span
                            className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-brand-500"
                            title="This vendor sells through multiple labs — this row is just the price for this one"
                          >
                            {c.labProvider === 'quest' ? 'Quest' : 'LabCorp'}
                          </span>
                        )}
                        <button
                          onClick={() => { setEditingUrl(c.id); setUrlDrafts((d) => ({ ...d, [c.id]: c.offering.externalUrl ?? '' })); }}
                          className="text-xs text-brand-300 hover:text-brand-600"
                          title="Fix this vendor's product URL — independent of approving/rejecting the price"
                        >
                          ✎
                        </button>
                      </div>
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

After Task 7 has staged at least one lab-tagged change (e.g. from the Dirt Cheap Labs scrape run
used to verify Task 7), open `/admin/changes` and confirm the "Quest" or "LabCorp" badge shows next
to the vendor name on those rows, and that ordinary (non-dual-lab) vendor rows show no badge at all.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/admin/changes/page.tsx
git commit -m "Show a Quest/LabCorp badge on dual-lab Change Queue rows"
```

---

## Self-Review Notes

- **Spec coverage:** Item 1 → Task 1. Item 2 → Tasks 5-8. Item 3 → Task 2. Item 4 → Task 3. Item 5 →
  Task 4. All five spec items have a task.
- **Ordering:** Tasks 1-4 have no dependencies on each other or on 5-8, and can run in parallel.
  Task 6 depends on nothing but must land before Task 7 (schema fields Task 7 writes to). Task 5 has
  no dependencies but is consumed by Task 7. Task 8 depends on Task 6's schema field existing and is
  most useful (visibly testable) after Task 7, though it would typecheck fine right after Task 6.
- **Type consistency checked:** `rankDualLabPrices` signature (Task 5) matches its only call site
  (Task 7, `publishStagedChange`) exactly — same parameter order (`quest, labcorp`), same
  `DualLabRanking` shape consumed field-by-field. `StagedPriceChange.labProvider` /
  `PriceHistory.labProvider` (Task 6) are both `String?` and both populated with the same literal
  values (`'quest' | 'labcorp' | null`) from Task 7. The `Change.labProvider` type added in Task 8
  matches that same literal union.
