import Link from 'next/link';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'oklch(0.97 0.01 280)' }}>
      <Navbar variant="light" />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1
            className="text-[72px] font-bold leading-none mb-2"
            style={{ color: 'oklch(0.85 0.08 280)' }}
          >
            404
          </h1>
          <h2 className="text-xl font-semibold text-[oklch(0.18_0.04_280)] mb-3">
            Page not found
          </h2>
          <p className="text-[oklch(0.5_0.04_280)] mb-8 leading-relaxed">
            The page you are looking for does not exist or may have been moved.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-btn font-semibold text-white no-underline text-[15px]"
            style={{ background: 'oklch(0.48 0.2 280)' }}
          >
            Back to home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
