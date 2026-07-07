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
      body: `LabTestCompare is a price-comparison tool, not a medical provider. Nothing on this site — including test descriptions, normal reference ranges, or preparation instructions — is medical advice, diagnosis, or treatment, and it is not a substitute for the advice of a qualified healthcare professional.

Always talk to a doctor or other qualified healthcare provider before ordering a lab test, interpreting your results, or making any decision about your health based on information found on this site. Reference ranges shown for a test are general and can vary by lab, method, age, sex, and other factors — only your ordering lab's official report and your provider should be used to interpret your actual results.

If you think you may have a medical emergency, call your doctor or emergency services immediately. Do not delay seeking medical advice because of something you read here.

Lab tests themselves are ordered from and performed by third-party ordering services and laboratories (e.g. Quest Diagnostics, LabCorp) — LabTestCompare does not draw blood, run tests, or issue results.`,
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
