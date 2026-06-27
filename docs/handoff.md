# Styling Handoff — Matching Prototype Pixel-for-Pixel

## Goal

Make the LabPrice Next.js app at `apps/web` match the HTML prototype at `project/Lab Test Price Comparison.dc.html` pixel-for-pixel — fonts, colors, spacing, cards, layout — everything.

## Current State

The page **structurally** renders all sections (nav, hero, search, stats bar, popular cards, all tests list, footer) but the **styling is off**:

- **Fonts**: The body should use `DM Sans` via Google Fonts. The `@theme` block in `globals.css` sets `--font-sans: "DM Sans", system-ui, sans-serif` and `layout.tsx` loads the font via `<link>` tag. However, Tailwind v4's `font-sans` class may not be applying the custom font properly — debug showed `sans, Arial, sans-serif` as the computed font in some cases.
- **Sizes/weights**: The h1 should be 54px/700, h2 24px/700, etc. We converted many to inline styles but some Tailwind arbitrary value classes remain and may not be generating CSS.
- **Colors**: Accent gradient should be `linear-gradient(135deg, oklch(0.58 0.22 280), oklch(0.52 0.22 305))` (the Indigo theme from the prototype, lines 566-569 of the HTML file).
- **Layout spacing**: Should match prototype exactly (e.g., hero padding `90px 24px 110px`, browse section `56px 24px 80px`).

## Root Cause Analysis

**Tailwind v4's arbitrary value syntax is unreliable with oklch colors.** Classes like `text-[oklch(0.72_0.06_280)]`, `bg-[oklch(0.4_0.08_280)]`, `text-[22px]` were silently not generating CSS in some cases, causing:
- Text defaulting to browser defaults instead of specified sizes
- Colors falling back to inherited/default values
- Custom theme tokens (`rounded-card`, `rounded-pill`, `text-success-700`) not always resolving

**Partial fix applied**: Converted most components to inline styles. But `page.tsx` still had Tailwind arbitrary classes for the stats bar, headings, and other elements. The latest round (not yet committed) converted those to inline styles too.

## What Was Tried

### Round 1: Color hue fix
- Changed brand-500/600/700 from hue 220 (blue) to hue 280 (purple)
- **Result**: Colors slightly better but still wrong — they should be Indigo theme values

### Round 2: Inline styles conversion
- Converted Navbar, TestCard, SearchBar, HomeTestList, CategoryTabs, Footer to use inline styles instead of Tailwind arbitrary classes
- **Result**: Cards, search bar, list structure improved significantly

### Round 3: Full page.tsx inline conversion
- Converted hero, stats bar, browse section headings and grid to pure inline styles
- Fixed "instantly" gradient from oklch (rendering green) to hex `#a855f7` → `#d946ef`
- **Result**: Much closer to prototype but user reports font/sizing still wrong

### Round 4: Exact accent gradient values
- Found prototype defaults to **Indigo** theme (not Sky): `oklch(0.58 0.22 280)` → `oklch(0.52 0.22 305)`
- Updated all accent color references across ~15 files
- **Result**: Not yet committed/tested on user's machine

### Key Discovery
Debug evaluation revealed `body.fontFamily = "sans, Arial, sans-serif"` — **DM Sans is not being applied**. This means either:
1. Google Fonts CDN link isn't loading
2. Tailwind v4's `font-sans` utility isn't mapping to `--font-sans` properly
3. The `@theme` `--font-sans` override isn't being picked up

## Files Actively Being Edited

| File | Status | Notes |
|------|--------|-------|
| `apps/web/app/page.tsx` | Modified | Fully converted to inline styles + demo fallback data |
| `apps/web/app/components/Navbar.tsx` | Modified | Inline styles, correct accent gradient |
| `apps/web/app/components/SearchBar.tsx` | Modified | Inline styles |
| `apps/web/app/components/TestCard.tsx` | Modified | Inline styles with hover state |
| `apps/web/app/components/HomeTestList.tsx` | Modified | Inline styles, correct grid layout |
| `apps/web/app/components/CategoryTabs.tsx` | Modified | Inline styles |
| `apps/web/app/components/Footer.tsx` | Modified | Inline styles |
| `apps/web/app/globals.css` | Modified | Updated brand colors to Indigo theme values |
| `apps/web/app/layout.tsx` | Unchanged | Loads DM Sans via Google Fonts `<link>` |
| `apps/web/app/error.tsx` | Modified | Accent color fix |
| `apps/web/app/not-found.tsx` | Modified | Accent color fix |
| `apps/web/app/loading.tsx` | Modified | Accent color fix |
| `apps/web/app/test/[slug]/TestDetailClient.tsx` | Modified | Accent color fix |
| `apps/web/app/test/[slug]/PriceAlertButton.tsx` | Modified | Accent color fix |

## Next Steps

### 1. Fix DM Sans font loading (CRITICAL)
The font is the biggest visual difference. Options:
- **Option A**: Use `next/font/google` instead of a `<link>` tag — this is the Next.js recommended approach and guarantees font loading:
  ```tsx
  // layout.tsx
  import { DM_Sans } from 'next/font/google';
  const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300','400','500','600','700'] });
  // Then: <body className={dmSans.className}>
  ```
- **Option B**: Add `font-family: 'DM Sans', system-ui, sans-serif` as an inline style on the `<body>` tag as a fallback
- **Option C**: Check if Tailwind v4's `@theme` `--font-sans` is actually generating CSS, or if the `font-sans` utility is producing `font-family: var(--font-sans)` correctly

### 2. Verify all inline styles are committed
Run `git diff --stat` to see what's staged/unstaged. The latest round of changes (full page.tsx inline conversion + accent gradient fixes) may not be committed yet.

### 3. Remove remaining Tailwind arbitrary value classes
Search for remaining `text-[`, `bg-[`, `border-[` patterns in the component files and convert to inline styles. Key patterns to find:
```
grep -rn 'className.*\[oklch\|className.*\[#\|text-\[.*px\]' apps/web/app/
```

### 4. Test on user's Windows machine
After pushing, user needs to:
```
git pull origin claude/github-write-access-3v9dld
pnpm dev
```

## Reference: Prototype Accent Theme Values

```js
// From project/Lab Test Price Comparison.dc.html line 566-570
const ACCENT_THEMES = {
  'Indigo':  { h: 280, primary: 'oklch(0.58 0.22 280)', secondary: 'oklch(0.52 0.22 305)' },
  'Emerald': { h: 155, primary: 'oklch(0.56 0.18 155)', secondary: 'oklch(0.5 0.18 168)' },
  'Sky':     { h: 220, primary: 'oklch(0.58 0.18 220)', secondary: 'oklch(0.52 0.18 232)' },
};
// Default theme: Indigo (line 597: this.props.accentTheme ?? 'Indigo')
// Accent gradient: linear-gradient(135deg, primary, secondary)
```

## Reference: Key Prototype CSS Values

- Page background: `oklch(0.97 0.01 280)`
- Nav: height 64px, max-width 1240px, dark bg `rgba(15,12,36,0.9)`
- Hero: padding `90px 24px 110px`, gradient `linear-gradient(155deg, oklch(0.17 0.1 280), oklch(0.21 0.12 295) 55%, oklch(0.19 0.09 265))`
- h1: 54px, 700, white, line-height 1.1, letter-spacing -1.8px
- "instantly" gradient: `linear-gradient(90deg, oklch(0.75 0.2 280), oklch(0.78 0.18 315))` — use hex `#a855f7` → `#d946ef` for browser compat
- Subtitle: 18px, line-height 1.55, margin-bottom 44px
- Search bar: white bg, border-radius 14px, padding `5px 5px 5px 18px`, shadow `0 24px 64px rgba(0,0,0,0.32)`
- Stats bar: bg `oklch(0.22 0.1 280)`, padding `14px 24px`, gap 48px between stats, gap 10px within each stat
- Browse section: padding `56px 24px 80px`
- Popular cards: white bg, 14px radius, 20px padding, 1.5px border `oklch(0.92 0.02 280)`, gap 14px
- All Tests list: white bg container, 14px radius, 1.5px border, grid `1fr 140px 90px 28px`
- Price color (green): `oklch(0.38 0.17 145)`
- Category badge colors: per-category oklch values in CAT_COLORS maps
