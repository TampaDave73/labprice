'use client';

// Footer "Suggest a Vendor" / "Suggest a Test" — buttons that open a modal form (was an inline
// accordion; user asked for buttons + form). Submissions land in VendorSuggestion/TestSuggestion
// (reviewed at /admin/suggestions) and email the admins (lib/services/notify-service.ts) — nothing
// here writes to the live catalog.
import { useState } from 'react';
import SuggestionModal from './SuggestionModal';

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  borderRadius: 9,
  border: '1.5px solid oklch(0.55 0.08 260)',
  background: 'oklch(0.3 0.07 260)',
  color: '#fff',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
};

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M7 2v10M2 7h10" />
    </svg>
  );
}

export default function SuggestionForms() {
  const [open, setOpen] = useState<'vendor' | 'test' | null>(null);

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px 32px' }}>
      <p style={{ fontSize: 13, color: 'oklch(0.82 0.03 260)', margin: '0 0 12px' }}>
        Missing a lab test or an ordering service you use? Tell us and we&apos;ll look into adding it.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button type="button" onClick={() => setOpen('vendor')} style={buttonStyle}>
          <PlusIcon />
          Suggest a Vendor
        </button>
        <button type="button" onClick={() => setOpen('test')} style={buttonStyle}>
          <PlusIcon />
          Suggest a Test
        </button>
      </div>

      <SuggestionModal
        open={open === 'vendor'}
        onClose={() => setOpen(null)}
        title="Suggest a Vendor"
        intro="Know an ordering service we should track prices from? We review every suggestion by hand."
        endpoint="/api/v1/suggestions/vendor"
        fields={[
          { name: 'vendorName', label: 'Vendor name', placeholder: 'e.g. Acme Labs', required: true },
          // type=text on purpose: the API normalizes protocol-less URLs ("walkinlab.com"); the
          // browser's native url validation would reject them before they reach it.
          { name: 'vendorUrl', label: 'Website (optional)', placeholder: 'e.g. acmelabs.com' },
          { name: 'email', label: 'Your email (optional)', placeholder: 'So we can follow up', type: 'email' },
          { name: 'note', label: 'Anything else? (optional)', type: 'textarea', placeholder: 'Why do you like them?' },
        ]}
      />
      <SuggestionModal
        open={open === 'test'}
        onClose={() => setOpen(null)}
        title="Suggest a Test"
        intro="Looking for a lab test we don't cover yet? Tell us which one."
        endpoint="/api/v1/suggestions/test"
        fields={[
          { name: 'testName', label: 'Test name', placeholder: 'e.g. Reverse T3', required: true },
          { name: 'email', label: 'Your email (optional)', placeholder: 'So we can follow up', type: 'email' },
          { name: 'note', label: 'Anything else? (optional)', type: 'textarea' },
        ]}
      />
    </div>
  );
}
