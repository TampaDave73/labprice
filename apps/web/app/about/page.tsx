import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';

export const metadata: Metadata = {
  title: 'About Us',
  description: 'What LabTestCompare does and why we built it.',
};

export default function AboutPage() {
  return (
    <StaticPageLayout title="About LabTestCompare">
      <p className="mb-4">
        LabTestCompare helps you find the cheapest self-pay price for a blood test before you book it.
        We track prices across ordering services that draw blood at Quest Diagnostics and LabCorp
        patient service centers, so you can compare the same test across vendors and pick the lowest
        price — no insurance required.
      </p>
      <p className="mb-4">
        Self-pay lab testing has grown a lot in the last few years, but prices for the exact same test
        can vary by 3–5x between ordering services. There was no single place to compare them side by
        side, so we built one.
      </p>
      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        How pricing works
      </h2>
      <p className="mb-4">
        Prices are collected directly from each ordering service&apos;s public catalog or product pages
        and refreshed on a regular schedule. We show the price we last observed and when we observed it
        — prices can change on the vendor&apos;s end at any time, so always confirm the final price on
        the vendor&apos;s own site before ordering (which is exactly what our &quot;Order&quot; links
        take you to).
      </p>
      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        How we make money
      </h2>
      <p className="mb-4">
        Some of the ordering services we link to pay us a referral fee if you order through our link.
        This never affects how we rank or display prices — the comparison table is always sorted by
        actual price, and we show every vendor we track, not just the ones that pay us.
      </p>
      <p className="mb-4">
        Don&apos;t see a lab you use, or a test you&apos;re looking for? Use the &quot;Suggest a
        Vendor&quot; / &quot;Suggest a Test&quot; links in the footer — we read every one.
      </p>
    </StaticPageLayout>
  );
}
