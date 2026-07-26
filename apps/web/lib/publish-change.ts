// Publish an approved staged price change to the live offering — inline, in a single transaction.
//
// WHY inline (not enqueued to the worker): the admin Change Queue must work with just the web app
// running. Publishing is a small DB write, so enqueuing it to BullMQ only added a hard dependency on
// the worker + Redis (and could hang the approve request if Redis stalled). This does it directly.
//
// This used to be its own separate implementation of the transaction (predating dual-lab pricing).
// A 2026-07-25 review caught that it had silently drifted out of sync with
// `@labprice/scrapers/src/catalog/persist.ts`'s `publishStagedChange` — the actual "single choke
// point" other publish paths (worker queue, inline "Scrape now") already went through: this copy had
// no `labProvider` awareness (so approving a dual-lab Quest/LabCorp change from the admin Change Queue
// would have corrupted the derived currentPrice/labProvider ranking), never wrote the `price_published`
// audit log, and lacked the atomic status-claim that guards against a double-publish race. Rather than
// re-fix all three bugs here, this now just re-exports the `persist.ts` version — see that file's
// docblock for the consolidated implementation. `persist.ts` documents itself as "safe to deep-import
// from Next.js server code" (HTTP/cheerio only, never Playwright), and other `apps/web` code already
// deep-imports from `@labprice/scrapers/src/catalog/*` (e.g. `lib/discovered-actions.ts`).
export { publishStagedChange } from '@labprice/scrapers/src/catalog/persist';
