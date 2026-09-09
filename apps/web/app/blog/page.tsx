// Public blog index (`/blog`). Lists published posts newest-first.
//
// Editorial content exists here to be found and quoted: each card leads with the post's excerpt,
// which is written as a standalone answer rather than a teaser, so the index itself carries meaning
// for a crawler that never opens an article.
import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@labprice/database';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { formatPostDate, readingTimeMinutes } from '@/lib/blog';

// Request-time, like the other DB-backed public pages: publishing from /admin/blog should show up
// without waiting out an ISR window (the admin PATCH also revalidates, this is the belt).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Guides to lab testing',
  description:
    'Plain-English guides to blood tests and self-pay lab work: how a draw works, when fasting matters, what each panel measures, and what it should cost.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Guides to lab testing | LabTestCompare',
    description: 'Plain-English guides to blood tests and self-pay lab work.',
    url: '/blog',
    type: 'website',
  },
};

async function getPosts() {
  try {
    return await prisma.post.findMany({
      where: { isPublished: true, deletedAt: null },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, excerpt: true, body: true, author: true, publishedAt: true, heroUrl: true, heroAlt: true },
    });
  } catch {
    // The blog is not load-bearing for the site's core job — a DB blip should render an empty index,
    // not a 500 on a page people reach from the footer.
    return [];
  }
}

export default async function BlogIndexPage() {
  const posts = await getPosts();
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

  // The index was only inheriting the root layout's Organization/WebSite, so the collection itself
  // wasn't a described entity. Blog + itemListElement gives the set an identity and names its parts.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${base}/blog#blog`,
    name: 'Guides to lab testing',
    description:
      'Plain-English guides to blood tests and self-pay lab work: how a draw works, when fasting matters, what each panel measures, and what it should cost.',
    url: `${base}/blog`,
    publisher: { '@id': `${base}/#organization` },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      '@id': `${base}/blog/${p.slug}#article`,
      headline: p.title,
      description: p.excerpt,
      url: `${base}/blog/${p.slug}`,
      author: { '@type': 'Person', name: p.author },
      ...(p.publishedAt && { datePublished: p.publishedAt.toISOString() }),
      ...(p.heroUrl && { image: `${base}${p.heroUrl}` }),
    })),
  };

  return (
    <div style={{ minHeight: '100vh', background: 'oklch(0.985 0.005 260)' }}>
      <script
        type="application/ld+json"
        // JSON.stringify doesn't escape "<"; escaping it stops a stray "</script>" in a title or
        // excerpt breaking out of this tag. Note the DOUBLE backslash — a single one is parsed by
        // TypeScript as the character "<", which makes the whole replace a silent no-op.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Navbar />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.8px', color: 'oklch(0.15 0.04 260)', marginBottom: 12 }}>
          Guides to lab testing
        </h1>
        <p style={{ fontSize: 17, color: 'oklch(0.45 0.04 260)', lineHeight: 1.65, maxWidth: 640, marginBottom: 40 }}>
          Plain-English explanations of how blood testing actually works — what a panel measures, when
          fasting matters, and why the same test can cost $20 or $200. Written to answer the question,
          then get out of the way.
        </p>

        {posts.length === 0 ? (
          <p style={{ fontSize: 15, color: 'oklch(0.5 0.04 260)' }}>No articles published yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {posts.map((p) => (
              <article
                key={p.slug}
                style={{ background: '#fff', border: '1.5px solid oklch(0.92 0.02 260)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexWrap: 'wrap' }}
              >
                {p.heroUrl && (
                  <div style={{ flex: '0 0 200px', minHeight: 160, position: 'relative', background: 'oklch(0.95 0.015 260)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.heroUrl}
                      alt={p.heroAlt ?? ''}
                      width={200}
                      height={160}
                      loading="lazy"
                      decoding="async"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}
                <div style={{ flex: '1 1 320px', padding: '22px 24px' }}>
                  <h2 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.35px', color: 'oklch(0.18 0.04 260)', marginBottom: 8, lineHeight: 1.3 }}>
                    <Link href={`/blog/${p.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {p.title}
                    </Link>
                  </h2>
                  <p style={{ fontSize: 14.5, color: 'oklch(0.42 0.03 260)', lineHeight: 1.7, marginBottom: 14 }}>{p.excerpt}</p>
                  <div style={{ fontSize: 12.5, color: 'oklch(0.55 0.03 260)' }}>
                    By {p.author}
                    {p.publishedAt ? ` · ${formatPostDate(p.publishedAt)}` : ''} · {readingTimeMinutes(p.body)} min read
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
