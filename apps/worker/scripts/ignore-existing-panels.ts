// One-off: existing VendorProduct rows that are panels (isPanel: true) but still sitting at
// UNMATCHED from before the 2026-07-25 auto-ignore change. Run once after deploying that change;
// safe to re-run (idempotent — only touches rows still UNMATCHED).
import '../src/env'; // must be first: self-locates root .env before prisma client construction reads DATABASE_URL
import { prisma } from '@labprice/database';

async function main() {
  const result = await prisma.vendorProduct.updateMany({
    where: { isPanel: true, status: 'UNMATCHED' },
    data: { status: 'IGNORED' },
  });
  console.log(`Marked ${result.count} existing panel(s) as Ignored.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
