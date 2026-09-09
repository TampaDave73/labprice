// Public blog article (`/blog/[slug]`).
//
// Structured for extraction, the same way the test template is: a real <article> with one <h1>,
// question-shaped <h2>s from the body, a visible FAQ that is also emitted as FAQPage JSON-LD (never
// one without the other), Article + BreadcrumbList nodes, and "compare prices" cards that route the
// reader into the actual comparison tables.
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@labprice/database';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import BlogBody, { type Prices } from '../../components/BlogBody';
import GuideLinks from '../../components/GuideLinks';
import { parseFaq, readingTimeMinutes, formatPostDate, priceTokenSlugs, heroSrcSet } from '@/lib/blog';
import { relatedGuides } from '@/lib/guides';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

async function getPost(slug: string) {
  const post = await prisma.post.findUnique({ where: { slug } });
  if (!post || !post.isPublished || post.deletedAt) return null;
  return post;
}

/** Resolves `relatedTests` slugs to real, live tests with a current price. A slug that no longer
 *  exists (or has no priced offerings) is skipped rather than rendering a dead card. */
async function getRelated(slugs: string[]) {
  if (slugs.length === 0) return [];
  const tests = await prisma.test.findMany({
    where: { slug: { in: slugs }, deletedAt: null },
    select: {
      name: true,
      slug: true,
      offerings: {
        // Same vendor filter every public offerings query needs — offering status doesn't follow
        // the vendor's (CLAUDE.md gotcha 12).
        where: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } },
        select: { currentPrice: true },
      },
    },
  });
  return tests
    .map((t) => {
      const prices = t.offerings.map((o) => Number(o.currentPrice));
      return { name: t.name, slug: t.slug, minPrice: prices.length ? Math.min(...prices) : null, vendorCount: prices.length };
    })
    .filter((t) => t.minPrice != null)
    // Preserve the author's ordering rather than the DB's.
    .sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug));
}

/**
 * Resolves the `[PRICE…:slug]` tokens a body uses. Reads the same offerings — with the same vendor
 * filter — as the "compare prices" cards below the article, so a quoted price and a card price can
 * never disagree. A slug with no live prices simply isn't in the map; the renderer has word
 * fallbacks for that case.
 */
async function getPrices(body: string): Promise<Prices> {
  const slugs = priceTokenSlugs(body);
  if (slugs.length === 0) return {};

  const tests = await prisma.test.findMany({
    where: { slug: { in: slugs }, deletedAt: null },
    select: {
      slug: true,
      offerings: {
        where: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } },
        select: { currentPrice: true, lastCheckedAt: true, priceUpdatedAt: true },
      },
    },
  });

  const out: Prices = {};
  for (const t of tests) {
    const prices = t.offerings.map((o) => Number(o.currentPrice));
    if (prices.length === 0) continue;
    const checks = t.offerings
      .map((o) => o.lastCheckedAt ?? o.priceUpdatedAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime());
    out[t.slug] = {
      min: Math.min(...prices),
      max: Math.max(...prices),
      count: prices.length,
      checkedAt: checks[0] ?? null,
    };
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug).catch(() => null);
  if (!post) return { title: 'Article not found' };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: `${post.title} | LabTestCompare`,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.publishedAt?.toISOString(),
      authors: [post.author],
      images: post.heroUrl ? [{ url: post.heroUrl, alt: post.heroAlt ?? post.title }] : ['/opengraph-image'],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const faqs = parseFaq(post.faq);
  const [related, prices, guides] = await Promise.all([
    getRelated(post.relatedTests),
    getPrices(post.body),
    relatedGuides(post.slug, post.relatedTests),
  ]);
  const url = `${BASE}/blog/${post.slug}`;

  // Only surfaced when the article has actually been revised since publication — an "Updated" line
  // on a piece that has never changed is noise, and freshness signals should be true ones.
  const updated = post.publishedAt && post.updatedAt.getTime() - post.publishedAt.getTime() > 86_400_000
    ? post.updatedAt
    : null;

  // One script tag per node — see the note on the test page: a `@graph` wrapper has no top-level
  // `@type`, which validators flag, and `@id` links resolve fine across separate tags.
  const nodes = [
    {
      '@type': 'Article',
        '@id': `${url}#article`,
        headline: post.title,
        description: post.excerpt,
        url,
        author: { '@type': 'Person', name: post.author },
        publisher: { '@id': `${BASE}/#organization` },
        ...(post.publishedAt && { datePublished: post.publishedAt.toISOString() }),
        dateModified: post.updatedAt.toISOString(),
        ...(post.heroUrl && { image: post.heroUrl }),
        mainEntityOfPage: url,
      },
      // Only when the questions are actually rendered below — structured data that describes
      // content a visitor can't see is exactly what gets a site's rich results pulled.
      ...(faqs.length > 0
        ? [
            {
              '@type': 'FAQPage',
              '@id': `${url}#faq`,
              mainEntity: faqs.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            },
          ]
        : []),
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${BASE}/blog` },
        { '@type': 'ListItem', position: 3, name: post.title },
      ],
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'oklch(0.985 0.005 260)' }}>
      {/* See the note on the test page: JSON.stringify doesn't escape "<". */}
      {nodes.map((node) => (
        <script
          key={node['@type'] as string}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', ...node }).replace(/</g, '\\u003c') }}
        />
      ))}
      <Navbar />
      <main id="main" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 22, fontSize: 13, color: 'oklch(0.58 0.04 260)' }}>
          <Link href="/" style={{ color: 'oklch(0.52 0.093 260)', fontWeight: 500, textDecoration: 'none' }}>
            Home
          </Link>
          <span aria-hidden="true">›</span>
          <Link href="/blog" style={{ color: 'oklch(0.52 0.093 260)', fontWeight: 500, textDecoration: 'none' }}>
            Guides
          </Link>
        </nav>

        <article>
          <h1 style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.9px', color: 'oklch(0.14 0.04 260)', lineHeight: 1.18, marginBottom: 14 }}>
            {post.title}
          </h1>
          <div style={{ fontSize: 13.5, color: 'oklch(0.52 0.03 260)', marginBottom: 26 }}>
            By <span style={{ fontWeight: 600, color: 'oklch(0.32 0.04 260)' }}>{post.author}</span>
            {post.publishedAt && (
              <>
                {' · '}
                <time dateTime={post.publishedAt.toISOString()}>{formatPostDate(post.publishedAt)}</time>
              </>
            )}{' · '}
            {readingTimeMinutes(post.body)} min read
            {updated && (
              <>
                {' · Updated '}
                <time dateTime={updated.toISOString()}>{formatPostDate(updated)}</time>
              </>
            )}
          </div>

          {post.heroUrl && (
            <figure style={{ margin: '0 0 32px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.heroUrl}
                srcSet={heroSrcSet(post.heroUrl)}
                sizes="(max-width: 800px) 100vw, 712px"
                alt={post.heroAlt ?? ''}
                width={1200}
                height={630}
                // The hero is the largest-contentful paint on this page, so it loads eagerly and at
                // high priority — the opposite of the lazy treatment the index cards get.
                fetchPriority="high"
                decoding="async"
                style={{ width: '100%', height: 'auto', aspectRatio: '1200 / 630', objectFit: 'cover', borderRadius: 14, display: 'block', background: 'oklch(0.94 0.015 260)' }}
              />
              {post.heroCredit && (
                <figcaption style={{ marginTop: 8, fontSize: 11.5, color: 'oklch(0.6 0.03 260)' }}>{post.heroCredit}</figcaption>
              )}
            </figure>
          )}

          {/* The excerpt again, as the article's own answer-first paragraph. It is written to stand
              alone, so a reader (or a model) that reads nothing else still gets the answer. */}
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'oklch(0.28 0.04 260)', fontWeight: 500, margin: '0 0 28px', paddingBottom: 24, borderBottom: '1px solid oklch(0.92 0.02 260)' }}>
            {post.excerpt}
          </p>

          <BlogBody body={post.body} prices={prices} />

          {faqs.length > 0 && (
            <section aria-labelledby="faq-heading" style={{ marginTop: 44 }}>
              <h2 id="faq-heading" style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.5px', color: 'oklch(0.2 0.04 260)', marginBottom: 16 }}>
                Common questions
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {faqs.map((f) => (
                  <div key={f.q} style={{ background: '#fff', border: '1.5px solid oklch(0.92 0.02 260)', borderRadius: 12, padding: '16px 20px' }}>
                    <h3 style={{ fontSize: 15.5, fontWeight: 650, color: 'oklch(0.2 0.04 260)', marginBottom: 7 }}>{f.q}</h3>
                    <p style={{ fontSize: 14.5, color: 'oklch(0.4 0.03 260)', lineHeight: 1.7, margin: 0 }}>{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>

        {related.length > 0 && (
          <section aria-labelledby="related-heading" style={{ marginTop: 44 }}>
            <h2 id="related-heading" style={{ fontSize: 19, fontWeight: 700, color: 'oklch(0.2 0.04 260)', marginBottom: 4 }}>
              Compare prices for the tests in this article
            </h2>
            <p style={{ fontSize: 13.5, color: 'oklch(0.52 0.03 260)', margin: '0 0 14px' }}>
              Live self-pay prices, updated by our own price checks.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {related.map((t) => (
                <Link
                  key={t.slug}
                  href={`/test/${t.slug}`}
                  style={{ display: 'block', background: '#fff', border: '1.5px solid oklch(0.92 0.02 260)', borderRadius: 12, padding: '15px 18px', textDecoration: 'none' }}
                >
                  <div style={{ fontSize: 14.5, fontWeight: 650, color: 'oklch(0.2 0.04 260)', marginBottom: 5 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: 'oklch(0.45 0.04 260)' }}>
                    from{' '}
                    <span style={{ fontWeight: 700, color: 'oklch(0.4 0.15 155)' }}>${t.minPrice!.toFixed(2)}</span>{' '}
                    · {t.vendorCount} service{t.vendorCount === 1 ? '' : 's'}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <GuideLinks guides={guides} heading="More guides" />

        <p style={{ marginTop: 40, padding: '14px 18px', background: 'oklch(0.97 0.01 260)', border: '1px solid oklch(0.92 0.015 260)', borderRadius: 10, fontSize: 12.5, color: 'oklch(0.5 0.03 260)', lineHeight: 1.65 }}>
          This article is general information about how lab testing works, not medical advice, and it
          cannot tell you which tests you need or what your results mean. Talk to a clinician about
          your own health.
        </p>
      </main>
      <Footer />
    </div>
  );
}
