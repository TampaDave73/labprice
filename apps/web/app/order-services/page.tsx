// Public "Order Services" directory (Server Component) — every active vendor plus an expandable
// table of the tests they offer and current prices. Distinct from the per-test comparison table on
// test/[slug]: this page is organized by vendor first, for people who already have a preferred lab
// and want to see everything it carries.
import { prisma } from '@labprice/database';
import type { Metadata } from 'next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import VendorAccordionList from './VendorAccordionList';
import { OG_IMAGE } from '@/lib/og';

export const metadata: Metadata = {
  title: 'Order Services — Compare Lab Test Vendors',
  description: 'Every self-pay lab ordering service we track, the tests each one carries, current prices, and which reference lab runs the sample — Quest or LabCorp.',
  alternates: { canonical: '/order-services' },
  openGraph: {
    title: 'Order Services — Compare Lab Test Vendors | LabTestCompare',
    description: 'Every self-pay lab ordering service we track, the tests each one carries, current prices, and which reference lab runs the sample — Quest or LabCorp.',
    url: '/order-services',
    type: 'website',
    images: [OG_IMAGE],
  },
};

// Rendered on demand (not prerendered at build) so the build needs no DB. At request time it queries
// the live catalog, so users always see current vendors/prices; low-traffic enough that per-request
// rendering is fine (and Cloudflare can cache in front).
export const dynamic = 'force-dynamic';

async function getVendors() {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      logoUrl: true,
      membershipNote: true,
      offerings: {
        where: { isActive: true, deletedAt: null, currentPrice: { not: null } },
        select: {
          id: true,
          currentPrice: true,
          memberPrice: true,
          test: { select: { name: true, slug: true } },
        },
        orderBy: { test: { name: 'asc' } },
      },
    },
  });

  return vendors.map((v) => {
    const prices = v.offerings.map((o) => Number(o.currentPrice));
    return {
      id: v.id,
      name: v.name,
      slug: v.slug,
      websiteUrl: v.websiteUrl,
      logoUrl: v.logoUrl,
      membershipNote: v.membershipNote,
      testCount: v.offerings.length,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      tests: v.offerings.map((o) => ({
        offeringId: o.id,
        testName: o.test.name,
        testSlug: o.test.slug,
        price: Number(o.currentPrice),
        memberPrice: o.memberPrice != null ? Number(o.memberPrice) : null,
      })),
    };
  });
}

export default async function OrderServicesPage() {
  const vendors = await getVendors();
  // Distinct tests across every service — the catalog's breadth, not the sum of the per-vendor counts.
  const testCount = new Set(vendors.flatMap((v) => v.tests.map((t) => t.testSlug))).size;

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.985 0.005 260)' }}>
      <Navbar />
      <main id="main" style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.6px', color: 'oklch(0.2 0.04 260)', marginBottom: 10 }}>
          Order Services
        </h1>
        {/* The list used to start immediately under the h1, with no stated scope and no inclusion
            criteria — nothing to quote and nothing establishing that the ordering is alphabetical
            rather than a ranking. Counts are derived, never written down. */}
        <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.3px', color: 'oklch(0.2 0.04 260)', marginBottom: 8 }}>
          Which lab test ordering services does LabTestCompare track?
        </h2>
        <p style={{ fontSize: 16, color: 'oklch(0.45 0.04 260)', lineHeight: 1.65, maxWidth: 680, marginBottom: 36 }}>
          LabTestCompare tracks {vendors.length} ordering service{vendors.length === 1 ? '' : 's'} that
          sell self-pay lab requisitions drawn at Quest Diagnostics and LabCorp patient service centers,
          covering {testCount} test{testCount === 1 ? '' : 's'} between them. Each entry shows how many
          tracked tests that service carries and its lowest current price; expand one to see every test
          and price. Services are listed alphabetically, not ranked — ranking happens on individual test
          pages, strictly by price.
        </p>
        <VendorAccordionList vendors={vendors} />
      </main>
      <Footer />
    </div>
  );
}
