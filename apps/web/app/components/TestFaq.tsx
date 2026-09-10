// The visible half of a test page's FAQ. The other half is the `FAQPage` node in
// app/test/[slug]/page.tsx, and both read the same array from lib/test-faq.ts — see that file for
// why they must never be assembled separately.
//
// Rendered as a plain <dl>, not a disclosure. An accordion here would be a conditional render away
// from deleting every answer from the served HTML, which is the exact bug that hid this page's prep
// instructions and reference ranges for months. Questions are <h3>s so they nest under the page's
// existing <h2> structure rather than competing with it.
import type { FaqItem } from '@/lib/test-faq';

export default function TestFaq({ items, heading }: { items: FaqItem[]; heading: string }) {
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="test-faq-heading"
      style={{ maxWidth: 1240, margin: '0 auto', padding: '8px 24px 32px' }}
    >
      <h2
        id="test-faq-heading"
        style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', color: 'oklch(0.18 0.04 260)', margin: '0 0 14px' }}
      >
        {heading}
      </h2>
      <dl style={{ margin: 0, display: 'grid', gap: 12 }}>
        {items.map((item) => (
          <div
            key={item.question}
            style={{ background: '#fff', border: '1px solid oklch(0.92 0.02 260)', borderRadius: 12, padding: '14px 18px' }}
          >
            <dt>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'oklch(0.2 0.04 260)', margin: 0 }}>
                {item.question}
              </h3>
            </dt>
            <dd style={{ fontSize: 14, lineHeight: 1.7, color: 'oklch(0.4 0.03 260)', margin: '6px 0 0' }}>
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
