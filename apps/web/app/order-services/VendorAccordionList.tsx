'use client';

// Client-side expand/collapse for the vendor list — kept separate from page.tsx (a Server Component)
// since only the accordion toggle needs interactivity; the data itself is server-fetched.
import { useState } from 'react';

interface VendorTest {
  offeringId: string;
  testName: string;
  testSlug: string;
  price: number;
  memberPrice: number | null;
}

interface Vendor {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  membershipNote: string | null;
  testCount: number;
  minPrice: number | null;
  tests: VendorTest[];
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 14 14"
      fill="none"
      stroke="oklch(0.5 0.04 230)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
    >
      <path d="M3 5.5L7 9.5L11 5.5" />
    </svg>
  );
}

export default function VendorAccordionList({ vendors }: { vendors: Vendor[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {vendors.map((v) => {
        const open = openId === v.id;
        return (
          <div
            key={v.id}
            style={{
              background: '#fff',
              border: '1.5px solid oklch(0.92 0.02 230)',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : v.id)}
              className="flex items-center"
              style={{
                width: '100%',
                padding: '18px 22px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                gap: 16,
              }}
            >
              {v.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.logoUrl} alt={v.name} style={{ height: 28, maxWidth: 120, objectFit: 'contain', flexShrink: 0 }} />
              ) : (
                <div style={{ fontSize: 17, fontWeight: 700, color: 'oklch(0.2 0.04 230)' }}>{v.name}</div>
              )}
              <div className="flex-1" />
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, color: 'oklch(0.5 0.04 230)' }}>
                  {v.testCount} {v.testCount === 1 ? 'test' : 'tests'}
                  {v.minPrice != null && <> · from ${v.minPrice.toFixed(2)}</>}
                </div>
                {v.membershipNote && (
                  <div style={{ fontSize: 12, color: 'oklch(0.5 0.13 165)', marginTop: 2 }}>{v.membershipNote}</div>
                )}
              </div>
              {v.websiteUrl && (
                <a
                  href={v.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: 13, color: 'oklch(0.5 0.14 230)', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
                >
                  Visit site ↗
                </a>
              )}
              <Chevron open={open} />
            </button>

            {open && (
              <div style={{ borderTop: '1px solid oklch(0.94 0.01 230)' }}>
                {v.tests.length === 0 ? (
                  <p style={{ padding: '16px 22px', fontSize: 13, color: 'oklch(0.55 0.04 230)' }}>
                    No priced tests on file for this vendor yet.
                  </p>
                ) : (
                  <table className="w-full" style={{ fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: 'oklch(0.97 0.01 230)' }}>
                        <th style={{ textAlign: 'left', padding: '9px 22px', fontSize: 11, fontWeight: 700, color: 'oklch(0.5 0.04 230)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Test
                        </th>
                        <th style={{ textAlign: 'right', padding: '9px 22px', fontSize: 11, fontWeight: 700, color: 'oklch(0.5 0.04 230)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Price
                        </th>
                        <th style={{ width: 100 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {v.tests.map((t) => (
                        <tr key={t.offeringId} style={{ borderTop: '1px solid oklch(0.95 0.01 230)' }}>
                          <td style={{ padding: '10px 22px' }}>
                            <a href={`/test/${t.testSlug}`} style={{ color: 'oklch(0.22 0.04 230)', textDecoration: 'none', fontWeight: 500 }}>
                              {t.testName}
                            </a>
                          </td>
                          <td style={{ padding: '10px 22px', textAlign: 'right', fontWeight: 700, color: 'oklch(0.22 0.04 230)' }}>
                            ${t.price.toFixed(2)}
                            {t.memberPrice != null && (
                              <span style={{ fontWeight: 500, color: 'oklch(0.5 0.13 165)', marginLeft: 6 }}>
                                (${t.memberPrice.toFixed(2)} member)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 22px', textAlign: 'right' }}>
                            <a
                              href={`/api/v1/go/${t.offeringId}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#fff',
                                background: 'oklch(0.56 0.14 230)',
                                padding: '5px 12px',
                                borderRadius: 7,
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Order
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
