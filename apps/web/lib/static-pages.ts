// Editable static pages (About / Terms / Privacy / Medical Disclaimer). Content lives in
// `system_settings` under `page_<slug>` and is edited from /admin/pages; if a page has never been
// saved it falls back to the DEFAULT below (which is the original hardcoded copy). The body is plain
// text with a tiny convention rendered by StaticPageBody: blank line = new block, `## ` = heading,
// lines starting `- ` = bullet list, everything else = paragraph.
import { prisma } from '@labprice/database';

export interface PageContent {
  title: string;
  updated: string | null;
  body: string;
}

export interface PageDef {
  slug: string; // also the public route: /about, /terms, /privacy, /disclaimer
  label: string; // admin nav / list label
  default: PageContent;
}

export const PAGE_DEFS: PageDef[] = [
  {
    slug: 'about',
    label: 'About',
    default: {
      title: 'About LabTestCompare',
      updated: null,
      body: `LabTestCompare helps you find the cheapest self-pay price for a blood test before you book it. We track prices across ordering services that draw blood at Quest Diagnostics and LabCorp patient service centers, so you can compare the same test across vendors and pick the lowest price — no insurance required.

Self-pay lab testing has grown a lot in the last few years, but prices for the exact same test can vary by 3–5x between ordering services. There was no single place to compare them side by side, so we built one.

## How pricing works

Prices are collected directly from each ordering service's public catalog or product pages and refreshed on a regular schedule. We show the price we last observed and when we observed it — prices can change on the vendor's end at any time, so always confirm the final price on the vendor's own site before ordering (which is exactly what our "Order" links take you to).

## How we make money

Some of the ordering services we link to pay us a referral fee if you order through our link. This never affects how we rank or display prices — the comparison table is always sorted by actual price, and we show every vendor we track, not just the ones that pay us.

Don't see a lab you use, or a test you're looking for? Use the "Suggest a Vendor" / "Suggest a Test" links in the footer — we read every one.`,
    },
  },
  {
    slug: 'terms',
    label: 'Terms of Service',
    default: {
      title: 'Terms of Service',
      updated: 'July 2026',
      body: `These Terms of Service ("Terms") govern your use of LabTestCompare ("LabTestCompare", "we", "us"). By using the site, you agree to these Terms.

## What we provide

LabTestCompare is a price-comparison directory. We display prices for lab tests sold by third-party ordering services, based on data we collect from those services' public websites. We do not sell, administer, or fulfill lab tests ourselves, and we are not a medical provider, laboratory, or insurer.

## Pricing accuracy

Prices shown are the last price we observed on a vendor's site and may not reflect the vendor's current price. We make reasonable efforts to keep prices current but do not guarantee accuracy. Always confirm the final price directly with the ordering service before purchasing — every "Order" link takes you to that vendor's own site to do so.

## Third-party ordering services

Any purchase you make is a transaction between you and the third-party ordering service, under that service's own terms and privacy policy — not with LabTestCompare. We are not a party to that transaction and are not responsible for the vendor's pricing, fulfillment, billing, or customer service. Some links to ordering services are referral/affiliate links, meaning we may earn a commission if you order through them, at no additional cost to you.

## No medical advice

Nothing on this site is medical advice. See the Medical Disclaimer (/disclaimer) for details.

## Disclaimer of warranties & limitation of liability

The site is provided "as is" without warranties of any kind. To the fullest extent permitted by law, LabTestCompare is not liable for any damages arising from your use of the site or any transaction with a third-party ordering service.

## Changes to these Terms

We may update these Terms from time to time. Continued use of the site after a change means you accept the updated Terms.

## Contact

Questions about these Terms? Reach us at hello@labtestcompare.com.`,
    },
  },
  {
    slug: 'privacy',
    label: 'Privacy Policy',
    default: {
      title: 'Privacy Policy',
      updated: 'July 2026',
      body: `This Privacy Policy explains what data LabTestCompare collects and how we use it.

## What we collect

- Account info — if you sign in (email magic link or Google), we store your email and name.
- Search & browsing activity — search queries, pages viewed, and which "Order" links you click, so we can improve the site and see which tests/vendors people are looking for. This is tied to your account if you're signed in, or an anonymous session otherwise.
- Suggestion form submissions — if you submit "Suggest a Vendor" or "Suggest a Test", we store what you entered (including your email if you provide one) so we can follow up.

## How we use it

To operate the site (comparing prices), to understand what people search for and which vendors get clicked (so we know what to add or improve), and to respond to suggestions you submit. We do not sell your personal data.

## Third-party ordering services

When you click an "Order" link, you leave LabTestCompare and land on that vendor's own site, subject to their own privacy policy. We record that a click happened (which offering, when) but we don't see what you do on the vendor's site afterward.

## Cookies & sessions

We use a session cookie to keep you signed in, and an anonymous session identifier for signed-out analytics. We don't use third-party advertising trackers.

## Your choices

To delete your account or request a copy of your data, email us at privacy@labtestcompare.com.

## Changes to this Policy

We may update this Privacy Policy from time to time; the "Last updated" date above will reflect the latest revision.

## Contact

Questions about this Policy? Reach us at privacy@labtestcompare.com.`,
    },
  },
  {
    slug: 'disclaimer',
    label: 'Medical Disclaimer',
    default: {
      title: 'Medical Disclaimer',
      updated: 'July 2026',
      // Structured as question-shaped H2s rather than four bare paragraphs. A policy page that a
      // machine can't segment is a policy page that doesn't count as a trust signal — this one was
      // scored as literally uncitable (0/100) in the 2026-09-10 GEO audit for exactly that reason.
      body: `LabTestCompare is a price-comparison tool, not a medical provider. Nothing on this site — including test descriptions, reference ranges, or preparation instructions — is medical advice, diagnosis, or treatment, and none of it is a substitute for the advice of a qualified healthcare professional.

## Is anything on LabTestCompare medical advice?

No. Everything published here is general information about what lab tests measure, how a blood draw works, and what different ordering services charge. We do not diagnose, treat, recommend tests for your situation, or interpret results. Always talk to a doctor or other qualified healthcare provider before ordering a lab test, interpreting your results, or making any decision about your health based on something you read here.

## Can I use the reference ranges shown here to interpret my results?

No. Reference ranges on this site are general illustrations. Real ranges vary by laboratory, testing method, age, sex, pregnancy, and other factors, and they change as methods change. Only the official report from the laboratory that ran your sample, read alongside your own provider, can tell you what your result means.

## Who actually performs the tests?

Third parties. Lab tests are ordered from independent ordering services and performed by laboratories such as Quest Diagnostics and LabCorp. LabTestCompare does not draw blood, run tests, issue results, or employ clinicians. We are not a laboratory, a medical provider, a pharmacy, or an insurer.

## Are the prices guaranteed?

No. Prices shown are the ones we last observed on each ordering service's own public pages, with the date we observed them. A vendor can change a price, add a fee, or stop selling a test at any time. Confirm the final price on the vendor's own site before you order — every "Order" link goes there directly.

## What should I do in an emergency?

Call your doctor or your local emergency number immediately. Do not delay seeking medical care because of anything you read on this site, and do not use this site to decide whether a symptom is urgent.

## Questions about this disclaimer

Email hello@labtestcompare.com. See also our [editorial policy](/editorial-policy) for how we source and correct information, and our [terms of service](/terms).`,
    },
  },
  {
    slug: 'contact',
    label: 'Contact',
    default: {
      title: 'Contact LabTestCompare',
      updated: null,
      body: `Email is the fastest way to reach us, and we read everything that arrives.

## Email

hello@labtestcompare.com

We aim to reply to questions about pricing, corrections, and coverage. We cannot answer questions about your own test results or which tests you should have — those belong with a clinician.

## Postal address

LabTestCompare
217 Hobbs St #107
Tampa, FL 33619
United States

## Reporting a wrong price or a dead link

Every test page has a "Report an error" button under the information panels. That routes straight to our review queue with the test and vendor attached, which is faster and more precise than email. See our [editorial policy](/editorial-policy) for how corrections are handled.

## Suggesting a test or an ordering service

Use the "Suggest a Test" and "Suggest a Vendor" buttons in the footer of any page.`,
    },
  },
  {
    slug: 'editorial-policy',
    label: 'Editorial Policy',
    default: {
      title: 'Editorial Policy',
      updated: 'September 2026',
      body: `This page explains where the information on LabTestCompare comes from, how it is checked, and how we decide what to show. If something here does not match what you see on the site, that is a bug — please tell us.

## What we publish

Two things. First, prices: what each ordering service charges for a given lab test. Second, plain-English explanations of what those tests measure and how testing works. We do not publish medical advice, treatment guidance, dosing information, or anything about which tests you personally should have.

## How prices are collected

Prices are read directly from each ordering service's own public catalog or product pages by an automated checker that runs on a schedule. Nothing is typed in by hand, and no ordering service can submit a price to us.

Every listing records the moment it was last verified, and that timestamp is shown next to the price. If a price has not been re-checked recently, the page says so rather than hiding it.

## How we make sure we are comparing the same test

Tests are matched across ordering services by Quest Diagnostics and LabCorp order code, not by marketing name. Two services can sell quite different tests under near-identical names, so a name match alone is not enough to put two prices side by side. Where a code match is uncertain, the test page carries a visible "partially verified" or "unverified" badge instead of presenting the match as settled.

## How results are ranked

Strictly by price, lowest first. Every ordering service we track appears on the test page, not only those with a commercial relationship with us. Some services pay us a referral fee when someone orders through our link, as described on our [About page](/about) — that arrangement has no effect on ranking, inclusion, or the price shown.

## Where health information comes from

Explanatory content is written from public reference sources, principally the National Library of Medicine's MedlinePlus, the National Institutes of Health, and the Centers for Disease Control and Prevention. Articles list their sources at the end so you can check them.

Reference ranges are described as varying by laboratory, sex, and age, because they do. We do not tell readers what their own results mean.

## Use of AI

Some copy on this site — the descriptions of what each test measures, and drafts of our guides — is generated with AI assistance and then reviewed before publication. We disclose this because we think you should know. AI is not used to set prices, choose rankings, or decide which services appear.

## Corrections

If a price is wrong, a link is dead, or an explanation is inaccurate, use the "Report an error" button on any test page or email hello@labtestcompare.com. Reports go to a human review queue. When a price looks wrong we re-check it against the vendor's site rather than simply taking the report at face value, and we correct the page if the report is right.

## Independence

LabTestCompare is independently operated. We are not a laboratory, we do not sell lab tests, and we are not owned by any laboratory or ordering service listed on the site.

## Medical disclaimer

Nothing on this site is medical advice, a diagnosis, or a substitute for care from a qualified clinician. See our [medical disclaimer](/disclaimer) in full.`,
    },
  },
];

export const PAGE_BY_SLUG: Record<string, PageDef> = Object.fromEntries(PAGE_DEFS.map((p) => [p.slug, p]));

/** The `system_settings.key` a page's content is stored under. */
export const pageSettingKey = (slug: string) => `page_${slug}`;

/** Effective content for a page: the saved override if present and non-empty, else the default. */
export async function getPageContent(slug: string): Promise<PageContent> {
  const def = PAGE_BY_SLUG[slug];
  if (!def) throw new Error(`Unknown static page: ${slug}`);

  // The DB may be unreachable at build time (Railway/CI containers build without DATABASE_URL). These
  // pages prerender at build, so swallow any DB error and fall back to the default (canonical) copy;
  // the saved override is picked up at runtime / on the next revalidate.
  let row: { value: unknown } | null = null;
  try {
    row = await prisma.systemSetting.findUnique({ where: { key: pageSettingKey(slug) } });
  } catch {
    return def.default;
  }

  const saved = row?.value as Partial<PageContent> | null | undefined;
  if (!saved || typeof saved !== 'object') return def.default;

  // Merge field-by-field so a partially-saved row still falls back sensibly per field.
  return {
    title: typeof saved.title === 'string' && saved.title.trim() ? saved.title : def.default.title,
    updated: typeof saved.updated === 'string' ? saved.updated.trim() || null : def.default.updated,
    body: typeof saved.body === 'string' && saved.body.trim() ? saved.body : def.default.body,
  };
}
