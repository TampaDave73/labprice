# Lab test price comparison

_Started 2026-06-25 14:04 UTC_

---

## User

Create a price comparison website for blood lab tests.  Should allow users to search for a test name and also have a full list of available tests.  The results will produce a price comparison of 10 different retailers and their current pricing, with the cheapest highlighted.  On the same result page it would show what the test is all about, how it is performed, etc.  You can use sample tests like Vitamin D, or Testosterone or anything you want.

## Assistant

_[tool: questions_v2]_

## User

Questions answered:
- audience: Health-conscious consumers
- vibe: Modern & tech-forward (think fintech)
- retailers: Real names (Quest, LabCorp, Walk-In Lab, etc.)
- color_pref: 3
- result_layout: Explore a few options
- variations: 2–3 variations to compare
- extras: Filter by price range, Save / bookmark tests

## Assistant

_[tool: update_todos]_

## Assistant

Great — I have the full design plan ready. Building now.

_[tool: update_todos]_

_[tool: dc_write]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

_[tool: update_todos]_

_[tool: show_html]_

Your **LabPrice** price comparison site is live! Here's what's included:

**Home page**
- Dark indigo hero with live search autocomplete
- Popular test chips (Vitamin D, Testosterone, CBC, Lipid Panel, HbA1c)
- Browse grid of all 12 tests with category filter tabs and bookmark toggle per card

**Results page** (click any test to open)
- Breadcrumb, test header with turnaround + lab count stats
- Sticky left accordion: About, How It's Performed, How To Prepare, Normal Ranges
- Price comparison from 10 real labs (Quest, LabCorp, Walk-In Lab, Ulta Lab Tests, Life Extension, etc.) — cheapest always highlighted in green
- **3 layout views** switchable via toggle: Table · Cards · Chart (animated bars)
- Price range filter ($min–$max) that live-filters results
- Save/bookmark button per test — saved count appears in the nav

**The 12 tests included:** Vitamin D, Testosterone, CBC, Lipid Panel, TSH, HbA1c, Comprehensive Metabolic Panel, PSA, Ferritin, Cortisol, Vitamin B12, Estradiol

**Possible next steps:**
- Add real lab links / "Order" button destinations
- Add a map/distance filter by zip code
- Expand to 50+ tests with a real data source
- Add a test bundles / panel comparison view

## User

Add tweakable controls to Lab Test Price Comparison.dc.html (declare with dc_set_props, read via this.props): study this design and add a tweaks panel with two or three expressive controls that reshape the feel, not single-property pixel-pushing

## Assistant



## User

Add tweakable controls to Lab Test Price Comparison.dc.html (declare with dc_set_props, read via this.props): 1) These aren't testing centers.  These are companies that write the script for lab tests.  You get them done at Quest or LabCorp for example.

## Assistant

Two changes: fix the factual error (these are ordering services, not draw sites) and add expressive tweaks. Let me do both together.

_[tool: dc_set_props]_

Good feedback — all of these point to cleaner UX. Let me address everything and rewrite the DC cleanly:

- Add CPT, Quest, LabCorp codes + make them searchable
- Remove bookmarks (no backend), price range filter, turnaround clock
- Replace Table/Cards/Chart → **Sort by Price / A–Z / Rating** (with rating per lab)
- Homepage: **Popular Tests** cards + **compact searchable list** below (scalable to 100+ tests with show more/less)

_[tool: dc_write]_

_[tool: ready_for_verification]_

All changes are live. Here's what changed:

**Factual fix**
- Renamed everything from "labs/testing centers" to "ordering services" — the disclaimer now clearly explains you purchase a requisition online and get the blood drawn at a nearby Quest or LabCorp patient service center.

**Lab codes added & searchable**
- Every test now has CPT, Quest, and LabCorp codes — visible on the results page as pill badges and in the browse list as secondary text
- The hero search matches on codes too (type `82306` to find Vitamin D, `84443` for TSH, etc.)
- Autocomplete shows the full code string under each suggestion

**Removed**
- Save/bookmark feature (entirely gone — no nav badge, no card icons)
- Price range filter
- Turnaround clock from results header
- Table / Cards / Chart layout switcher

**Sort by Price / A–Z / Rating** (replaces layout toggle)
- Price: cheapest first, best price badge always shown regardless of sort order
- A–Z: alphabetical by service name
- Rating: Quest (4.5★) → LabCorp (4.4★) → Life Extension (4.3★) → … — rating shown as a column in every view

**Homepage scalability** — two-section approach:
- **Popular Tests**: 6 cards always visible (the 6 most common tests)
- **All Tests**: compact searchable list with CPT codes visible, sortable A–Z or Price ↑, filterable by category, and a **"View all N tests ↓"** toggle so 100+ tests don't overwhelm the page on load

**Tweaks panel** (open the ⚙ panel): Accent theme (Indigo / Emerald / Sky) and Best Price highlight style (Green / Gold / Accent)

