'use client';

// Reusable "small feedback form in a modal" used by the footer's Suggest a Vendor / Suggest a Test
// buttons and the test page's Report an Error button. Posts JSON to `endpoint` ({...fields, ...extra})
// and shows a thanks state; nothing here writes to the live catalog — every endpoint behind it is a
// triage queue reviewed at /admin/suggestions.
import { useEffect, useRef, useState, type FormEvent } from 'react';

export interface ModalField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'textarea' | 'select';
  options?: { value: string; label: string }[]; // for type: 'select'
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  intro?: string;
  endpoint: string;
  fields: ModalField[];
  /** Extra payload merged into the POST body (e.g. { testId }) — not shown as inputs. */
  extra?: Record<string, unknown>;
  submitLabel?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1.5px solid oklch(0.88 0.02 230)',
  background: '#fff',
  color: 'oklch(0.2 0.04 230)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'oklch(0.45 0.04 230)',
  marginBottom: 5,
};

export default function SuggestionModal({ open, onClose, title, intro, endpoint, fields, extra, submitLabel = 'Submit' }: Props) {
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  // Esc closes; body scroll locks while open. Reset to a fresh form on every open.
  useEffect(() => {
    if (!open) return;
    setState('idle');
    setErrorMsg(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstInputRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    setState('submitting');
    setErrorMsg(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, ...extra }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message ?? 'Submission failed');
      }
      setState('done');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong — try again.');
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'oklch(0.15 0.03 230 / 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, padding: '24px 26px 26px', boxShadow: '0 20px 60px oklch(0.15 0.03 230 / 0.35)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: intro ? 6 : 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'oklch(0.2 0.04 230)', margin: 0 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'oklch(0.55 0.04 230)', fontSize: 18, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        {intro && <p style={{ fontSize: 13, color: 'oklch(0.5 0.04 230)', lineHeight: 1.55, margin: '0 0 16px' }}>{intro}</p>}

        {state === 'done' ? (
          <div>
            <p style={{ fontSize: 14, color: 'oklch(0.4 0.12 150)', fontWeight: 600, margin: '4px 0 16px' }}>
              Thanks! We&apos;ll take a look.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'oklch(0.56 0.14 230)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {fields.map((f, i) => (
                <div key={f.name}>
                  <label htmlFor={`sm-${f.name}`} style={labelStyle}>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      id={`sm-${f.name}`}
                      name={f.name}
                      placeholder={f.placeholder}
                      required={f.required}
                      rows={4}
                      ref={i === 0 ? (el) => { firstInputRef.current = el; } : undefined}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  ) : f.type === 'select' ? (
                    <select
                      id={`sm-${f.name}`}
                      name={f.name}
                      required={f.required}
                      defaultValue=""
                      ref={i === 0 ? (el) => { firstInputRef.current = el; } : undefined}
                      style={inputStyle}
                    >
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`sm-${f.name}`}
                      name={f.name}
                      type={f.type ?? 'text'}
                      placeholder={f.placeholder}
                      required={f.required}
                      ref={i === 0 ? (el) => { firstInputRef.current = el; } : undefined}
                      style={inputStyle}
                    />
                  )}
                </div>
              ))}
              {state === 'error' && (
                <p style={{ fontSize: 13, color: 'oklch(0.5 0.19 25)', margin: 0 }}>{errorMsg}</p>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                <button
                  type="submit"
                  disabled={state === 'submitting'}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'oklch(0.56 0.14 230)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: state === 'submitting' ? 'not-allowed' : 'pointer',
                    opacity: state === 'submitting' ? 0.6 : 1,
                  }}
                >
                  {state === 'submitting' ? 'Sending…' : submitLabel}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1.5px solid oklch(0.88 0.02 230)', background: '#fff', color: 'oklch(0.45 0.04 230)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
