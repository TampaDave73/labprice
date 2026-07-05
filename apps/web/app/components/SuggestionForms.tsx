'use client';

// Two collapsed links in the footer ("Suggest a Vendor" / "Suggest a Test") that expand into an
// inline form when clicked. Submissions land in VendorSuggestion/TestSuggestion (see
// /admin/suggestions) and email the admin (lib/services/notify-service.ts) — nothing here writes to
// the live catalog.
import { useState, type FormEvent } from 'react';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 8,
  border: '1px solid oklch(0.4 0.05 230)',
  background: 'oklch(0.22 0.06 230)',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
    >
      <path d="M3 5.5L7 9.5L11 5.5" />
    </svg>
  );
}

function SuggestAccordion({
  title,
  endpoint,
  fields,
}: {
  title: string;
  endpoint: string;
  fields: { name: string; placeholder: string; required?: boolean; type?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setState('submitting');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('failed');
      setState('done');
      form.reset();
    } catch {
      setState('error');
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: 14,
          fontWeight: 700,
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        {title}
        <Chevron open={open} />
      </button>

      {open && (
        <div style={{ marginTop: 12, animation: 'slideDown 0.15s ease' }}>
          {state === 'done' ? (
            <p style={{ fontSize: 13, color: 'oklch(0.75 0.1 150)' }}>Thanks! We&apos;ll take a look.</p>
          ) : (
            <form onSubmit={onSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fields.map((f) => (
                  <input
                    key={f.name}
                    name={f.name}
                    type={f.type ?? 'text'}
                    placeholder={f.placeholder}
                    required={f.required}
                    style={inputStyle}
                  />
                ))}
                <button
                  type="submit"
                  disabled={state === 'submitting'}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'oklch(0.58 0.19 250)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: state === 'submitting' ? 'not-allowed' : 'pointer',
                    opacity: state === 'submitting' ? 0.6 : 1,
                    alignSelf: 'flex-start',
                  }}
                >
                  {state === 'submitting' ? 'Sending…' : 'Submit'}
                </button>
                {state === 'error' && (
                  <p style={{ fontSize: 12, color: 'oklch(0.7 0.18 25)' }}>Something went wrong — try again.</p>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function SuggestionForms() {
  return (
    <div
      style={{
        maxWidth: 1240,
        margin: '0 auto',
        padding: '0 24px 32px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 32,
      }}
    >
      <SuggestAccordion
        title="Suggest a Vendor"
        endpoint="/api/v1/suggestions/vendor"
        fields={[
          { name: 'vendorName', placeholder: 'Vendor name', required: true },
          { name: 'vendorUrl', placeholder: 'Website (optional)', type: 'url' },
          { name: 'email', placeholder: 'Your email (optional)', type: 'email' },
          { name: 'note', placeholder: 'Anything else? (optional)' },
        ]}
      />
      <SuggestAccordion
        title="Suggest a Test"
        endpoint="/api/v1/suggestions/test"
        fields={[
          { name: 'testName', placeholder: 'Test name', required: true },
          { name: 'email', placeholder: 'Your email (optional)', type: 'email' },
          { name: 'note', placeholder: 'Anything else? (optional)' },
        ]}
      />
    </div>
  );
}
