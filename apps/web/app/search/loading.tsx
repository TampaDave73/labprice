// The only `loading.tsx` left in the app, and it is here for a specific reason.
//
// A `loading.tsx` wraps its segment in a Suspense boundary, which makes Next flush the response
// shell — headers and all — before the page has rendered. Any `notFound()` thrown after that point
// can no longer set the status, so the page returns **HTTP 200 with a 404 body**: a soft 404. A root
// `app/loading.tsx` did exactly that to every dynamic route on the site (/blog/*, /test/*,
// /category/*) until 2026-09-10.
//
// `/search` is the one page where the trade is free: it is `robots: { index: false }` and
// `Disallow`ed in robots.ts, it never calls `notFound()` (an empty result set is a rendered page,
// not a missing one), and it runs the slowest query on the site — a Postgres full-text search with a
// trigram fallback. So it is also the page that most wants a spinner.
//
// Before adding another one of these: if the segment can 404, it cannot have a loading.tsx.
export default function Loading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'oklch(0.985 0.005 260)' }}
    >
      <div
        className="animate-spin"
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid oklch(0.9 0.04 260)',
          borderTopColor: 'oklch(0.49 0.14 262)',
        }}
      />
    </div>
  );
}
