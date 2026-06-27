# LabPrice — Session Handoff

## Project Overview

LabPrice is a lab test price comparison app. Users compare blood test ordering prices across 10 services (Ulta Lab Tests, Life Extension, DirectLabs, Walk-In Lab, etc.) — these are ordering services where users buy requisitions online, then get blood drawn at Quest/LabCorp patient service centers.

- **Stack**: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Prisma ORM, PostgreSQL 16, Redis 7, BullMQ
- **Monorepo**: pnpm + Turborepo — `apps/web`, `apps/worker`, `packages/{database,shared,ui,config,scrapers}`
- **Branch**: `claude/github-write-access-3v9dld`
- **Prototype (source of truth)**: `project/Lab Test Price Comparison.dc.html` (808 lines)

## What's Done

### 1. Full App Scaffold (Phases 1–6)
All application code is built: home page, test detail pages, search, category browsing, dashboard (saved tests, alerts, notifications), admin panel, Docker/CI config, SEO/monitoring. See git log for phase commits.

### 2. Pixel-Perfect Styling (Home Page) ✅
The home page components match the prototype pixel-for-pixel. All components use **inline styles** (not Tailwind arbitrary classes) because Tailwind v4 silently fails to generate CSS for oklch arbitrary values.

**Completed components** (all inline styles, verified against prototype):
- `apps/web/app/layout.tsx` — DM Sans via `next/font/google`, body bg `oklch(0.97 0.01 280)`
- `apps/web/app/page.tsx` — Hero, stats bar, browse section, popular cards grid. Has DEMO_CATEGORIES and DEMO_TESTS arrays for rendering without a database.
- `apps/web/app/components/Navbar.tsx` — 64px height, 1240px max-width, dark bg, webkit backdrop blur
- `apps/web/app/components/SearchBar.tsx` — 14px radius, shadow, autocomplete dropdown
- `apps/web/app/components/TestCard.tsx` — 14px radius, 20px padding, 1.5px border, hover effects, gap 5px
- `apps/web/app/components/HomeTestList.tsx` — Grid `1fr 140px 90px 28px`, row hover
- `apps/web/app/components/CategoryTabs.tsx` — Active tab uses accent gradient
- `apps/web/app/components/Footer.tsx` — Dark bg, `marginTop: auto`
- `apps/web/app/loading.tsx`, `not-found.tsx`, `error.tsx` — All converted to inline styles

### 3. Scraper Framework Scaffolded
- `packages/scrapers/` — Config-driven vendor adapter architecture
- Two engines: `PlaywrightEngine` (JS-rendered sites), `HttpEngine` (static pages)
- Two vendor configs exist: `ulta-lab-tests.ts`, `life-extension.ts`
- Supporting modules: `normalizer.ts` (price parsing/change detection), `publisher.ts`, `proxy-manager.ts`
- Worker app: `apps/worker/` runs scrape jobs via BullMQ

### 4. Documentation
- `docs/01-prd.md` through `docs/10-implementation-roadmap.md` — Full architecture docs
- `docs/setup-guide.md` — Beginner-friendly deployment guide (VPS, DB, Redis, domain, etc.)

## What's NOT Done

### 1. Secondary Pages Still Use Tailwind Arbitrary Classes
These pages have `text-[oklch(...)]`, `bg-[oklch(...)]`, `border-[...]` classes that **silently produce no CSS** in Tailwind v4. They need the same inline-style conversion applied to home page components:

- `apps/web/app/test/[slug]/TestDetailClient.tsx` — Extensive (biggest file)
- `apps/web/app/test/[slug]/PriceAlertButton.tsx`
- `apps/web/app/test/[slug]/SaveTestButton.tsx`
- `apps/web/app/test/[slug]/loading.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/dashboard/components/SavedTestCard.tsx`
- `apps/web/app/dashboard/components/NotificationList.tsx`
- `apps/web/app/dashboard/components/AlertList.tsx`
- `apps/web/app/category/[slug]/page.tsx`

**Fix pattern**: Replace all `className="... text-[oklch(...)] ..."` with inline `style={{ color: 'oklch(...)' }}`. See any home page component for examples.

### 2. Scraper Configs Needed for 8 More Vendors
Only 2 of 10 vendor configs exist. Missing:
- DirectLabs, True Health Labs, Walk-In Lab, Request A Test, Quest Diagnostics, LabCorp, Health Testing Centers, Any Lab Test Now

Each needs a config in `packages/scrapers/src/configs/` following the `VendorConfig` interface (see `src/types.ts`), plus export from `src/index.ts`.

### 3. Scraper Validation
The existing configs (`ulta-lab-tests.ts`, `life-extension.ts`) have placeholder CSS selectors that need validation against actual vendor websites. Test URLs need to be populated for all 12 demo tests.

### 4. Build Issue
`npx next build` fails with `Environment variable not found: DATABASE_URL` during sitemap.xml prerendering. Expected without a running database — not a code bug, but needs conditional handling for build-time.

## Critical Knowledge

### Tailwind v4 + oklch = Broken
**Root cause of ALL styling issues**: Tailwind v4's arbitrary value syntax (`text-[oklch(0.5 0.2 280)]`) silently fails to generate CSS. The classes appear in the HTML but produce no styles. The fix is always inline styles: `style={{ color: 'oklch(0.5 0.2 280)' }}`.

### Prototype Accent Theme
The prototype defaults to **Indigo** (NOT Sky):
```js
// project/Lab Test Price Comparison.dc.html lines 566-570
primary: 'oklch(0.58 0.22 280)'   // hue 280 = purple/violet
secondary: 'oklch(0.52 0.22 305)'
// Accent gradient: linear-gradient(135deg, primary, secondary)
```

### Key Prototype CSS Values
- Page bg: `oklch(0.97 0.01 280)`
- Nav: 64px height, `rgba(15,12,36,0.9)`, blur(20px)
- Hero: padding `90px 24px 110px`, h1 54px/700, letter-spacing -1.8px
- Search bar: 14px radius, padding `5px 5px 5px 18px`, shadow `0 24px 64px rgba(0,0,0,0.32)`
- Stats bar: bg `oklch(0.22 0.1 280)`, padding `14px 24px`, gap 48px
- Cards: 14px radius, 20px padding, 1.5px border `oklch(0.92 0.02 280)`
- All Tests grid: `1fr 140px 90px 28px`
- Price green: `oklch(0.38 0.17 145)`
- Footer: bg `oklch(0.17 0.09 280)`, `marginTop: auto`

### Demo Data
`apps/web/app/page.tsx` has `DEMO_CATEGORIES` and `DEMO_TESTS` arrays so the page renders without a database connection.

## How to Run

```bash
git checkout claude/github-write-access-3v9dld
git pull origin claude/github-write-access-3v9dld
pnpm install
pnpm dev    # starts Next.js on localhost:3000
```

No database needed for home page (demo data fallback). For full functionality: see `docs/setup-guide.md`.
