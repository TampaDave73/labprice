// One-off: backfill Offering.questPrice/labcorpPrice from the existing currentPrice/labProvider/
// altLabPrice/altLabProvider on Dirt Cheap Labs offerings, ahead of the dual-lab Change Queue
// staging change (2026-07-25). Run once after `db:push`. Safe to re-run (idempotent — recomputes
// from the same source fields each time).
import '../src/env'; // must be first: self-locates root .env before prisma client construction reads DATABASE_URL
import { prisma } from '@labprice/database';

async function main() {
  const vendor = await prisma.vendor.findFirst({ where: { slug: 'dirtcheaplabs' } });
  if (!vendor) {
    console.log('No dirtcheaplabs vendor found — nothing to backfill.');
    return;
  }

  const offerings = await prisma.offering.findMany({
    where: { vendorId: vendor.id, currentPrice: { not: null } },
    select: { id: true, currentPrice: true, labProvider: true, altLabPrice: true, altLabProvider: true },
  });

  let updated = 0;
  for (const o of offerings) {
    const questPrice = o.labProvider === 'quest' ? o.currentPrice : o.altLabProvider === 'quest' ? o.altLabPrice : null;
    const labcorpPrice = o.labProvider === 'labcorp' ? o.currentPrice : o.altLabProvider === 'labcorp' ? o.altLabPrice : null;
    if (questPrice == null && labcorpPrice == null) continue;
    await prisma.offering.update({ where: { id: o.id }, data: { questPrice, labcorpPrice } });
    updated++;
  }
  console.log(`Backfilled ${updated}/${offerings.length} Dirt Cheap Labs offering(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
