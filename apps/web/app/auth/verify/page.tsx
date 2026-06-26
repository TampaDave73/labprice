export default function VerifyRequest() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-md bg-white rounded-card border border-brand-200 p-8 text-center">
        <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="oklch(0.38 0.17 145)" strokeWidth="2">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-brand-900 tracking-tight mb-2">Check your email</h1>
        <p className="text-brand-400 leading-relaxed">
          A magic link has been sent to your email address. Click the link to sign in.
        </p>
      </div>
    </div>
  );
}
