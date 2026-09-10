---
name: seo-aeo
description: Use when adding or changing ANY public page, route, blog post, or user-facing copy on LabTestCompare — new pages, new templates, new metadata, new JSON-LD, new article content, or edits to existing ones. Encodes the SEO/AEO/GEO rules the site has been audited against, so a new page ships compliant instead of being retrofitted.
---

# SEO / AEO / GEO rules for LabTestCompare

Every public page on this site has been audited against these rules and passes them. A new page that
skips them is a regression, not a neutral omission. Work through the checklist for the page type you
are touching; each item says *why*, because the why is what tells you how to adapt it to a case the
checklist did not anticipate.

**Scope:** public routes only. `/admin/*` is `noindex` by design and none of this applies there.

## The one-line version

A page should answer its own question in its first paragraph, structure the answer with
question-shaped headings, put its facts in a table rather than a layout, describe itself in JSON-LD,
and link to the pages it talks about. Everything below is a specific case of that.

## Checklist: every new public route

- [ ] **`generateMetadata` (or `metadata`) with a unique title and description.** Title 30–60 chars,
      description 120–160. Longer titles get truncated in results; shorter descriptions waste the slot.
- [ ] **`alternates: { canonical: '/your-path' }`** — relative, resolved against `metadataBase` in
      `app/layout.tsx`. Without it every `?utm_*` variant is a separately indexable URL.
- [ ] **`openGraph` including `images: [OG_IMAGE]`** (`import { OG_IMAGE } from '@/lib/og'`).
      Declaring `openGraph` on a route **replaces the root default wholesale** — this silently dropped
      `og:image` from four routes once already. The card is a route handler at
      `app/opengraph-image.png/`, *not* Next's `opengraph-image` file convention: the convention
      serves it at the extensionless `/opengraph-image`, which validators reject as "not a valid image
      URL". Nothing is auto-injected as a result, so the import is the only source.
- [ ] **Exactly one `<h1>`**, and it is not identical to the `<title>`.
- [ ] **`<main id="main">`** wrapping the body — the layout's skip-to-content link targets `#main`,
      and it is the landmark assistive tech and extractors look for.
- [ ] **`<nav aria-label="Breadcrumb">`** if the page renders breadcrumbs, plus a `BreadcrumbList`
      node. Visual-only breadcrumbs are invisible to search.
- [ ] **Add the route to `app/sitemap.ts`.** Static routes go in `staticEntries`; anything DB-backed
      gets a `lastModified` reflecting *content* change, not row touch — the test entries use the
      freshest offering `lastCheckedAt`, not `test.updatedAt`, because only one of those moves daily.
- [ ] **Thin or duplicative? `robots: { index: false, follow: true }`** and add it to `DISALLOW` in
      `app/robots.ts`, the way `/search` is handled.
- [ ] **No `loading.tsx` in the segment or any segment above it, if the route can 404.** A loading
      boundary flushes the response shell before the page renders, so `notFound()` can no longer set
      the status and the route answers **200 with a 404 body** — a soft 404. One root
      `app/loading.tsx` did this to `/blog/*`, `/test/*` and `/category/*` simultaneously.
      `app/search/loading.tsx` is the only surviving one: `noindex`, never 404s, slowest query.
- [ ] **Confirm a missing row actually 404s**: `curl -s -o /dev/null -w '%{http_code}' <url>/nope`.
      A page that returns 200 for content that doesn't exist is worse than one that doesn't exist.
- [ ] **Render `<PageProvenance>`** (or an equivalent) at the foot of any page whose facts change:
      who compiled it, a `<time>` for when the facts were last verified, and a link out to a house
      source. Three separate E-E-A-T findings — "no author byline", "no publication or modification
      date", "no external citations" — are one missing block.
- [ ] **Don't add a `<style>` block, but if you must, ship it minified on one line** and put the
      explanation in a JSX comment above it. An unminified inline `<style>` is an audit finding, and
      the string is in the HTML of every page that renders the component.

## Checklist: content on the page

- [ ] **Answer first.** The opening paragraph states the answer in full — a reader, or a model, that
      reads nothing else should still have it. Context comes after, never before.
- [ ] **Headings are questions people actually type**, not labels. "How do you prepare for a Ferritin
      test?" beats "Preparation". Headings are the unit search and answer engines segment a page by.
- [ ] **Never render content conditionally inside a disclosure.** `{isOpen && <div>…</div>}` deletes
      the text from the served HTML entirely. Always mount it and hide with `[hidden]`. This exact bug
      hid the prep instructions and reference ranges on every test page for months.
- [ ] **Tabular facts go in a real `<table>`** with `<caption>`, `scope="col"` headers and a
      `scope="row"` first cell. A CSS grid of `<div>`s makes the row-to-value pairing a visual
      coincidence that nothing can parse.
- [ ] **Meaning is never carried by colour alone.** The cheapest row is tinted *and* labelled
      "Best price" in words.
- [ ] **No text below 12px.** Sub-12px reads as a mobile-readability failure, and per-row labels
      multiply fast — 27 elements on one test page, from four styles.
- [ ] **Dates are `<time dateTime="ISO">`.** Visible text alone is not a date signal. Format them
      `en-US` — "September 9, 2026", not "9 September 2026".
- [ ] **US English in everything a visitor reads.** color, liter, center, hemoglobin, gray, "most
      expensive" — never colour, litre, centre, haemoglobin, grey, "dearest". The audience is
      American and the catalog's own test names use US spellings, so a British spelling is both
      off-register and inconsistent with the product. This shipped once, in a chart legend, a table
      header and four places across two published articles.

## Checklist: structured data

- [ ] **One `<script type="application/ld+json">` per node, each with a top-level `@type`.** Do *not*
      wrap them in a single `@graph`: a `@graph` has no top-level type and validators report it as a
      schema missing its type. `@id` cross-references resolve fine across separate tags.
- [ ] **Escape with `.replace(/</g, '\\u003c')` — note the DOUBLE backslash in source.** A single
      backslash is parsed by TypeScript as the character `<`, making the whole replace a silent no-op.
      That shipped once and was invisible until read closely.
- [ ] **Put properties on the type that defines them.** `offers` belongs on `Product`/`Service`, not
      on `MedicalTest`; `bodyLocation` means an anatomical site, not a category name. Both were wrong
      here once.
- [ ] **Never describe content the visitor cannot see.** `FAQPage` is emitted only from the same `faq`
      field that renders visibly. Structured data describing invisible content is what gets rich
      results revoked.
- [ ] Reference the site entity as `publisher: { '@id': '<BASE_URL>/#organization' }` rather than
      redeclaring the organisation.

## Checklist: images

- [ ] **WebP, two widths, with `srcset`.** Heroes follow `<name>-1600.webp` with an 800px sibling;
      `heroSrcSet()` in `lib/blog.ts` derives the srcset from the stored URL.
- [ ] **Explicit `width` and `height`** on every image. One unsized remote `<img>` per row reflows the
      whole list as they arrive.
- [ ] **The LCP image loads eagerly at `fetchPriority="high"`; everything else is `loading="lazy"`.**
      Lazy-loading the largest above-fold image is a hard audit failure.
- [ ] **Alt text under 125 characters**, describing the image rather than restating the caption.
- [ ] **An article with no figure is unfinished.** Use `[PRICE-CHART:slug,slug]` (live prices, always
      current) or a named `[FIG:…]` diagram where it genuinely fits. Every chart carries a table view
      underneath — that is both the accessible equivalent and the version an answer engine can quote.
      Load the `dataviz` skill before writing any new chart.

## Checklist: internal linking

- [ ] **Every new page is reachable from somewhere other than the sitemap.** The blog shipped
      reachable only from the footer, giving it exactly one inbound link per page — close to invisible.
- [ ] **Link in both directions.** Articles link to test pages *and* test pages link back, both
      derived from `Post.relatedTests`, so the graph is maintained in one place.
- [ ] **Descriptive anchor text.** Never "click here", never a bare URL.
- [ ] **Whole cards are clickable**, not just the title — one `<Link>` wrapping image, heading and
      call-to-action, with the CTA as a styled `<span>` (a nested `<a>` is invalid HTML).

## Checklist: article and health copy (YMYL)

This site is health-adjacent, which raises the bar rather than changing it.

- [ ] **No medical advice, dosing, diagnosis, or "which test you should have".** Explain what a test
      measures and how testing works; stop there.
- [ ] **Reference ranges are always described as varying by lab, sex and age**, because they do.
- [ ] **Cite sources, and check each URL returns 200 before publishing it.** MedlinePlus, NIH and CDC
      are the house sources. Two candidate URLs 404'd the first time this was done.
- [ ] **External links render `rel="nofollow noopener"`** and open in a new tab.
- [ ] **A visible disclaimer** on every article.
- [ ] **Prices are never literals in copy.** Use `[PRICE:slug]`, `[PRICE-RANGE:slug]`,
      `[PRICE-COUNT:slug]`, `[PRICE-DATE:slug]`, resolved at request time from the same offerings
      query the price cards use — prose then cannot contradict the table under it or go stale.
- [ ] **Disclose AI assistance** where it applies; `/editorial-policy` already does, site-wide.

## Checklist: chrome shared by every page

- [ ] **The header carries the site's core claim and a search field.** Both used to live only in the
      homepage hero, which meant a visitor landing on a test page from search saw neither. Moving them
      up also let the hero shrink from ~600px to ~260px — the homepage complaint that started this was
      "90% blank and then a HUGE header".
- [ ] **The footer is trust signals and links, not branding.** Postal address (schema.org microdata),
      email, disclaimer, policy links. A second copy of the logo is vertical space spent on nothing.
- [ ] **`unstable_cache` in shared chrome must not cache a failure.** Production builds run with no
      `DATABASE_URL`, so a count read at build time returns the fallback and then *sticks* for the
      cache's whole revalidate window. `lib/site-stats.ts` re-reads live when the cached value is a
      known-impossible zero.

## Checklist: rankings and "popular" claims

- [ ] **A list labelled by behaviour must come from behaviour.** `lib/popular-tests.ts` ranks from
      `page_views`, `affiliate_clicks` and *committed* `search_logs` over 60 days, weighted by intent
      (click-out ≫ search ≫ view). The hand-set `Test.isPopular` flag is the fallback, not the source.
- [ ] **Caption the fallback differently from the real thing.** Rendering "what visitors are viewing"
      above a curated list is a claim the code can't back. Two captions, chosen by the same flag that
      chooses the list.

## What NOT to chase

These recur in audit tools and are not worth acting on here:

- **Text-to-HTML ratio** (~4–5%). That is the App Router's inline RSC payload, not filler. "Fixing"
  it means abandoning React Server Components.
- **The render-blocking `polyfills-*.js` in `<head>`.** Next injects it with `noModule`, so every
  browser that supports ES modules skips it entirely and the ones that don't are the ones that need
  it. There is no supported way to remove or defer it, and Lighthouse scores Performance 100 anyway.
- **"No text compression detected."** False negative from a HEAD request. Production serves gzip:
  `curl -s -H 'Accept-Encoding: gzip' <url> | wc -c` is ~26KB against ~112KB uncompressed. Brotli and
  HTTP/3 `alt-svc` are Railway's edge to offer, not ours.
- **Keyword density on test pages** ("iron at 5.03%"). The repetition is the test name inside
  entity-consistent question headings — which is the thing that makes the page answer a query at all.
  If the number bothers you, the fix is *more prose*, never fewer mentions of the subject.
- **"Future publication dates" on blog posts.** The auditor's model is comparing against its own
  training cutoff, not today's date.
- **Backlinks, Wikipedia/Wikidata entities, YouTube, Reddit and LinkedIn presence.** Real signals,
  but not code — they don't belong in a page build and can't be shipped from here.

And two traps:

- **Do not add per-AI-agent groups to `robots.txt`.** Repeating a `Disallow` list under each named
  agent makes audit tools report those crawlers as *blocked*. The `*` group already allows them;
  saying nothing extra is the correct way to welcome AI crawlers.
- **Do not turn streaming metadata back on.** `htmlLimitedBots: /.*/` in `next.config.ts` forces
  Next to resolve `generateMetadata` into `<head>` before the first byte. Without it the tags stream
  into `<body>` and get hoisted client-side, which reads to any static HTML consumer as "11 `<meta>`
  tags inside `<body>`" and — worse — "viewport meta tag is missing", scored as a HIGH mobile-first
  indexing failure. The cost is a few milliseconds of TTFB.

## Verify before claiming done

```bash
cd apps/web && npx tsc --noEmit
curl -s https://labtestcompare.com/<path> > /tmp/p.html
grep -o '<h1[^>]*>[^<]*' /tmp/p.html                   # exactly one
grep -o '<link rel="canonical"[^>]*>' /tmp/p.html
grep -o '<meta property="og:image[^>]*>' /tmp/p.html
grep -o '"@type":"[A-Za-z]*"' /tmp/p.html | sort -u     # every node typed
```

Then look at the rendered page in a browser. A passing type-check says nothing about whether the
content reached the HTML — which is exactly the failure mode this file exists to prevent.

One more check worth running on any page whose metadata is DB-backed — every `<meta>` must be in
`<head>`, and the count in `<body>` must be zero:

```bash
python - <<'PY'
import re
h = open('/tmp/p.html', encoding='utf-8').read()
head = h.split('</head>')[0]
print('head:', len(re.findall(r'<meta', head)), 'total:', len(re.findall(r'<meta', h)))
PY
```

## After publishing

`revalidatePost()` pings IndexNow (`lib/indexnow.ts`) so Bing — and therefore Bing Copilot — sees a
new or edited article without waiting for a recrawl. It is fire-and-forget and production-only. If
you add another content type that publishes on its own path, ping it the same way. Google ignores
IndexNow; Google's channel is `app/sitemap.ts`, which must list the new route.
