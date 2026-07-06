export default async function SignIn({ searchParams }: { searchParams: Promise<{ devError?: string }> }) {
  const { devError } = await searchParams;
  const isDev = process.env.NODE_ENV !== 'production';
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-md bg-white rounded-card border border-brand-200 p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-600 rounded-[12px] flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="3" fill="white"/>
              <line x1="9" y1="2" x2="9" y2="5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="9" y1="13" x2="9" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="2" y1="9" x2="5" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="13" y1="9" x2="16" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-brand-900 tracking-tight">Sign in to LabTestCompare</h1>
          <p className="text-sm text-brand-400 mt-2">Access your account and admin tools</p>
        </div>
        <form action="/api/auth/signin/resend" method="POST" className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-brand-700 mb-1.5">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full px-4 py-3 border border-brand-200 rounded-btn text-base outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-btn px-6 py-3 text-base font-semibold cursor-pointer"
          >
            Send Magic Link
          </button>
        </form>
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-brand-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-brand-400">or continue with</span>
          </div>
        </div>
        <form action="/api/auth/signin/google" method="POST">
          <button
            type="submit"
            className="w-full bg-white text-brand-700 border border-brand-200 rounded-btn px-6 py-3 text-base font-medium cursor-pointer hover:bg-brand-50 transition-colors"
          >
            Google
          </button>
        </form>

        {isDev && (
          // Local-only shortcut: the email/Google providers need credentials that aren't set in dev,
          // so this signs you straight into an existing account. Never rendered in production.
          <div className="mt-8 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Dev sign-in (local only)</p>
            <p className="mt-1 text-xs text-amber-700/80">
              Email &amp; Google login need <code>RESEND_API_KEY</code> / <code>GOOGLE_CLIENT_*</code> in <code>.env</code>.
              Until those are set, use this to sign into an existing account.
            </p>
            {devError && <p className="mt-2 text-xs font-medium text-red-600">{devError}</p>}
            <form action="/api/dev-login" method="POST" className="mt-3 flex gap-2">
              <input
                name="email"
                type="email"
                required
                defaultValue="davidsabot@gmail.com"
                className="min-w-0 flex-1 rounded-btn border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="shrink-0 rounded-btn bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Sign in
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
