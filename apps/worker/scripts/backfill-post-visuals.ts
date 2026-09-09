// One-off: gives posts that were drafted before figures existed a hero image and a price chart.
//
//   pnpm --filter @labprice/worker exec tsx scripts/backfill-post-visuals.ts [--dry]
//
// Only touches posts with no hero. The chart block is inserted before the "## Sources" heading if
// there is one, otherwise appended — never in the middle of an argument, and never twice.
import 'dotenv/config';
import { prisma } from '@labprice/database';

const GENERIC_HEROES = [
  { file: 'generic-laboratory', alt: 'A microscope on a laboratory bench.' },
  { file: 'generic-test-tube', alt: 'A gloved hand holding a laboratory test tube.' },
  { file: 'generic-lab-supplies', alt: 'Laboratory sample collection supplies on a white surface.' },
];

function pickHero(slug: string) {
  const n = [...slug].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hero = GENERIC_HEROES[n % GENERIC_HEROES.length]!;
  return { heroUrl: `/blog/${hero.file}-1600.webp`, heroAlt: hero.alt, heroCredit: 'Photo: Unsplash' };
}

async function main() {
  const dry = process.argv.includes('--dry');
  const posts = await prisma.post.findMany({
    where: { deletedAt: null, OR: [{ heroUrl: null }, { heroUrl: '' }] },
  });

  if (posts.length === 0) {
    console.log('Nothing to backfill — every post has a hero.');
    return;
  }

  for (const p of posts) {
    const data: Record<string, string> = { ...pickHero(p.slug) };

    // A chart needs at least two priced tests to say anything; one bar is a stat, not a chart.
    const priced = await prisma.test.findMany({
      where: {
        slug: { in: p.relatedTests },
        deletedAt: null,
        offerings: { some: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } } },
      },
      select: { slug: true },
    });

    let body = p.body;
    const alreadyCharted = /\[PRICE-CHART:/.test(body);
    if (priced.length >= 2 && !alreadyCharted) {
      // Preserve the author's ordering rather than the DB's.
      const slugs = p.relatedTests.filter((s) => priced.some((t) => t.slug === s));
      const block = `## What do these tests cost?\n\nPrices are read live from every ordering service we track, so this is current rather than a snapshot.\n\n[PRICE-CHART:${slugs.join(',')}]`;
      const sourcesAt = body.indexOf('## Sources');
      body = sourcesAt === -1 ? `${body.trimEnd()}\n\n${block}\n` : `${body.slice(0, sourcesAt)}${block}\n\n${body.slice(sourcesAt)}`;
      data.body = body;
    }

    console.log(
      `${dry ? 'would update' : 'updated'}  /blog/${p.slug}  hero=${data.heroUrl}${data.body ? `  + chart(${priced.length} tests)` : '  (no chart — fewer than 2 priced tests)'}`,
    );
    if (!dry) await prisma.post.update({ where: { id: p.id }, data });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
