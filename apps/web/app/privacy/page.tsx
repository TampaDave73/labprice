import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for LabTestCompare.',
};

export default function PrivacyPage() {
  return (
    <StaticPageLayout title="Privacy Policy" updated="July 2026">
      <p className="mb-4">This Privacy Policy explains what data LabTestCompare collects and how we use it.</p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        What we collect
      </h2>
      <ul className="list-disc pl-6 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>
          <strong>Account info</strong> — if you sign in (email magic link or Google), we store your
          email, name, and any tests you save or price alerts you set.
        </li>
        <li>
          <strong>Search &amp; browsing activity</strong> — search queries, pages viewed, and which
          &quot;Order&quot; links you click, so we can improve the site and see which tests/vendors
          people are looking for. This is tied to your account if you&apos;re signed in, or an anonymous
          session otherwise.
        </li>
        <li>
          <strong>Suggestion form submissions</strong> — if you submit &quot;Suggest a Vendor&quot; or
          &quot;Suggest a Test&quot;, we store what you entered (including your email if you provide
          one) so we can follow up.
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        How we use it
      </h2>
      <p className="mb-4">
        To operate the site (comparing prices, saved tests, price alerts), to understand what people
        search for and which vendors get clicked (so we know what to add or improve), and to respond to
        suggestions you submit. We do not sell your personal data.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Third-party ordering services
      </h2>
      <p className="mb-4">
        When you click an &quot;Order&quot; link, you leave LabTestCompare and land on that vendor&apos;s
        own site, subject to their own privacy policy. We record that a click happened (which
        offering, when) but we don&apos;t see what you do on the vendor&apos;s site afterward.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Cookies &amp; sessions
      </h2>
      <p className="mb-4">
        We use a session cookie to keep you signed in, and an anonymous session identifier for signed-out
        analytics. We don&apos;t use third-party advertising trackers.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Your choices
      </h2>
      <p className="mb-4">
        You can delete saved tests and price alerts from your dashboard at any time. To delete your
        account entirely or request a copy of your data, email us at privacy@labtestcompare.com.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Changes to this Policy
      </h2>
      <p className="mb-4">
        We may update this Privacy Policy from time to time; the &quot;Last updated&quot; date above will
        reflect the latest revision.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3" style={{ color: 'oklch(0.2 0.04 230)' }}>
        Contact
      </h2>
      <p className="mb-4">Questions about this Policy? Reach us at privacy@labtestcompare.com.</p>
    </StaticPageLayout>
  );
}
