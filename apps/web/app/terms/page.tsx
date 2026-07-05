import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for LabTestCompare.',
};

export default function TermsPage() {
  return (
    <StaticPageLayout title="Terms of Service" updated="July 2026">
      <p className="mb-4">
        These Terms of Service (&quot;Terms&quot;) govern your use of LabTestCompare
        (&quot;LabTestCompare&quot;, &quot;we&quot;, &quot;us&quot;). By using the site, you agree to
        these Terms.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        What we provide
      </h2>
      <p className="mb-4">
        LabTestCompare is a price-comparison directory. We display prices for lab tests sold by
        third-party ordering services, based on data we collect from those services&apos; public
        websites. We do not sell, administer, or fulfill lab tests ourselves, and we are not a medical
        provider, laboratory, or insurer.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Pricing accuracy
      </h2>
      <p className="mb-4">
        Prices shown are the last price we observed on a vendor&apos;s site and may not reflect the
        vendor&apos;s current price. We make reasonable efforts to keep prices current but do not
        guarantee accuracy. Always confirm the final price directly with the ordering service before
        purchasing — every &quot;Order&quot; link takes you to that vendor&apos;s own site to do so.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Third-party ordering services
      </h2>
      <p className="mb-4">
        Any purchase you make is a transaction between you and the third-party ordering service, under
        that service&apos;s own terms and privacy policy — not with LabTestCompare. We are not a party
        to that transaction and are not responsible for the vendor&apos;s pricing, fulfillment, billing,
        or customer service. Some links to ordering services are referral/affiliate links, meaning we
        may earn a commission if you order through them, at no additional cost to you.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        No medical advice
      </h2>
      <p className="mb-4">
        Nothing on this site is medical advice. See the{' '}
        <a href="/disclaimer" style={{ color: 'oklch(0.5 0.14 230)' }}>
          Medical Disclaimer
        </a>{' '}
        for details.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Accounts
      </h2>
      <p className="mb-4">
        Creating an account (to save tests or set price alerts) is optional. You&apos;re responsible for
        keeping access to your account secure and for any activity under it.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Disclaimer of warranties &amp; limitation of liability
      </h2>
      <p className="mb-4">
        The site is provided &quot;as is&quot; without warranties of any kind. To the fullest extent
        permitted by law, LabTestCompare is not liable for any damages arising from your use of the
        site or any transaction with a third-party ordering service.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Changes to these Terms
      </h2>
      <p className="mb-4">
        We may update these Terms from time to time. Continued use of the site after a change means you
        accept the updated Terms.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Contact
      </h2>
      <p className="mb-4">Questions about these Terms? Reach us at hello@labtestcompare.com.</p>
    </StaticPageLayout>
  );
}
