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
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'oklch(0.97 0.01 280)' }}
    >
      <div className="text-center max-w-md">
        <div
          className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center text-2xl"
          style={{ background: 'oklch(0.95 0.06 15)', color: 'oklch(0.45 0.14 15)' }}
        >
          !
        </div>
        <h1 className="text-2xl font-bold text-[oklch(0.18_0.04_280)] mb-3">
          Something went wrong
        </h1>
        <p className="text-[oklch(0.5_0.04_280)] mb-8 leading-relaxed">
          We hit an unexpected error. Please try again, and if the problem persists, contact support.
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 rounded-btn font-semibold text-white cursor-pointer border-none text-[15px]"
          style={{ background: 'oklch(0.52 0.22 305)' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
