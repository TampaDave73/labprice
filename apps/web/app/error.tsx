'use client';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        background: 'oklch(0.985 0.005 230)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            margin: '0 auto 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            background: 'oklch(0.95 0.06 15)',
            color: 'oklch(0.45 0.14 15)',
          }}
        >
          !
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'oklch(0.18 0.04 230)', marginBottom: 12 }}>
          Something went wrong
        </h1>
        <p style={{ color: 'oklch(0.5 0.04 230)', marginBottom: 32, lineHeight: 1.6 }}>
          We hit an unexpected error. Please try again, and if the problem persists, contact support.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '12px 24px',
            borderRadius: 10,
            fontWeight: 600,
            color: '#fff',
            cursor: 'pointer',
            border: 'none',
            fontSize: 15,
            background: 'oklch(0.49 0.14 232)',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
