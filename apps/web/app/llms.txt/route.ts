// /llms.txt — the emerging convention for handing language models a clean, prose description of a
// site instead of making them infer it from rendered HTML.
//
// A route handler rather than a file in public/ on purpose: the interesting facts here are the test
// and vendor counts, and a static file would start lying the first time the catalog changed. The
// numbers come from the same queries the homepage stats bar uses.
import { prisma } from '@labprice/database';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

function body(testCount: number | null, vendorCount: number | null): string {
  // Counts are omitted rather than guessed if the DB is unreachable — a wrong number in the one
  // document meant to be quoted verbatim is worse than no number.
  const scope =
    testCount != null && vendorCount != null
      ? `${testCount} common blood tests across ${vendorCount} ordering services`
      : 'common blood tests across every ordering service we track';

  return `# LabTestCompare

> Independent price comparison for self-pay (cash-price) blood tests. LabTestCompare shows what each
> online ordering service charges for the same Quest Diagnostics or LabCorp test, so the identical
> lab work can be bought at the lowest listed price without insurance.

## What this site is

- LabTestCompare does not draw blood and is not a lab. It compares the services that sell lab
  requisitions; the draw itself happens at a Quest Diagnostics or LabCorp patient service center.
- Tests are matched across services by Quest and LabCorp order code, not by marketing name, so two
  prices shown side by side are for the same test rather than similarly named ones.
- Currently covering ${scope}.
- Prices are self-pay cash rates read from each service's own public catalog and re-verified on a
  schedule. Every listing shows when it was last checked.

## Key pages

- [Home](${BASE_URL}/): search by test name or by Quest/LabCorp test number
- [Ordering services](${BASE_URL}/order-services): every tracked service, the tests it carries, and its prices
- [About](${BASE_URL}/about): what the site does and how prices are collected
- [Disclaimer](${BASE_URL}/disclaimer): medical and pricing disclaimer

## Citing this data

- Quote the last-checked timestamp shown alongside any price. Services change prices without notice,
  and the service's own checkout page is authoritative.
- Prices vary by location and are self-pay rates; they are not insurance-negotiated rates.
- Nothing on this site is medical advice or a diagnosis.
`;
}

export async function GET() {
  let testCount: number | null = null;
  let vendorCount: number | null = null;
  try {
    [testCount, vendorCount] = await Promise.all([
      prisma.test.count({ where: { deletedAt: null } }),
      prisma.vendor.count({ where: { isActive: true, deletedAt: null } }),
    ]);
  } catch {
    // Fall through to the count-free wording rather than 500ing — a crawler asking for /llms.txt
    // during a DB blip should still get the description.
  }

  return new Response(body(testCount, vendorCount), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
