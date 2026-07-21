import { NextResponse } from 'next/server';
import { prisma, Prisma, getVendorTrustMap } from '@labprice/database';
import { auth } from '@/lib/auth';
import { toCsv } from '@/lib/csv';
import { clusterKey, computeConfidence } from '@/lib/discovered-actions';

// CSV export of the Discovered review queue (UNMATCHED, non-panel VendorProduct rows) for offline
// triage — the one-by-one /admin/discovered UI doesn't scale to a quarterly catch-up pass across
// thousands of rows. One row per VENDOR PRODUCT (not per cluster): a cluster is only a grouping hint
// here, so a reviewer can approve 8 of a cluster's 9 vendors and leave the price-outlier one for
// later, which the cluster-level UI actions can't do. `vendor_product_id` is the row's real identity;
// re-import matches on it, never on name. See api/v1/admin/discovered/import for the write-back half.
export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const rows = await prisma.vendorProduct.findMany({
    where: { status: 'UNMATCHED', isPanel: false },
    select: {
      id: true, name: true, normalizedName: true, url: true, price: true,
      questCode: true, labcorpCode: true,
      vendor: { select: { id: true, name: true, trustOverride: true } },
    },
    orderBy: { name: 'asc' },
  });

  const trustMap = await getVendorTrustMap([...new Set(rows.map((r) => r.vendor.id))]);

  const clusterMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = clusterKey(r);
    clusterMap.set(key, [...(clusterMap.get(key) ?? []), r]);
  }

  // Cluster label = most common product name in the group, same rule the review UI uses.
  const labelOf = (products: typeof rows) => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  };

  const clusters = [...clusterMap.entries()]
    .map(([key, products]) => ({ key, label: labelOf(products), vendorCount: new Set(products.map((p) => p.vendor.id)).size, products }))
    .sort((a, b) => b.vendorCount - a.vendorCount || a.label.localeCompare(b.label));

  const header = [
    'vendor_product_id', 'cluster_id', 'cluster_label', 'vendor_name', 'vendor_trust',
    'raw_name', 'price', 'quest_code', 'labcorp_code', 'product_url', 'confidence', 'duplicate_vendor_in_cluster',
    'decision', 'attach_test_slug', 'new_test_name', 'new_test_slug', 'new_test_category',
  ];

  const csvRows = clusters.flatMap((c) => {
    // Same vendor appears more than once in this cluster — a near-certain sign it still mixes two
    // distinct products (see clusterKey's comment). Flagged per-row so it's sortable/filterable in
    // the sheet, not just visible one card at a time in the UI.
    const vendorCounts = new Map<string, number>();
    for (const p of c.products) vendorCounts.set(p.vendor.id, (vendorCounts.get(p.vendor.id) ?? 0) + 1);

    return [...c.products]
      .sort((a, b) => a.vendor.name.localeCompare(b.vendor.name))
      .map((p) => {
        const trust = p.vendor.trustOverride ?? trustMap.get(p.vendor.id) ?? 'MEDIUM';
        const confidence = computeConfidence(p, c.products);
        const duplicateVendor = (vendorCounts.get(p.vendor.id) ?? 0) > 1 ? 'yes' : '';
        return [
          p.id, c.key, c.label, p.vendor.name, trust,
          p.name, p.price != null ? Number(p.price).toFixed(2) : '', p.questCode ?? '', p.labcorpCode ?? '',
          p.url ?? '', confidence, duplicateVendor,
          '', '', '', '', '', // decision + the four fill-in-offline columns start blank
        ];
      });
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(header, csvRows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="labtestcompare-discovered-${stamp}.csv"`,
    },
  });
}
