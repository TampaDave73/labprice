// IndexNow: tell Bing (and Yandex, Seznam, Naver — they share one endpoint) that a URL changed,
// instead of waiting for a recrawl.
//
// Why bother: Bing Copilot answers are sourced from the Bing index, and a site this small gets
// crawled infrequently. A ping is the difference between an updated article appearing in Copilot
// this week and next month. Google ignores IndexNow — Google's side of this is the sitemap, which
// app/sitemap.ts already keeps current.
//
// The key is deliberately not a secret. IndexNow's whole verification model is "prove you control
// the host by serving this key at a well-known path" — public/<key>.txt does exactly that, and the
// key is meaningless to anyone who can't also write to this domain.
const KEY = '24015cc3f19502cba305f0c2f7f7d8ff';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

/**
 * Submit one or more site paths ("/blog/x") for recrawl. Fire-and-forget by design: this is a
 * best-effort hint about a page that is already public, so a failed ping must never fail the publish
 * that triggered it, and nothing waits on the result.
 */
export async function pingIndexNow(paths: string[]): Promise<void> {
  // Only in production. A localhost URL list would be rejected, and worse, submitting from a dev
  // machine would advertise whatever half-finished state that machine is in.
  if (process.env.NODE_ENV !== 'production') return;

  const urlList = Array.from(new Set(paths)).map((p) => new URL(p, BASE_URL).toString());
  if (urlList.length === 0) return;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(BASE_URL).host,
        key: KEY,
        keyLocation: `${BASE_URL}/${KEY}.txt`,
        urlList,
      }),
    });
    // 200 and 202 both mean accepted; 422 means the key didn't verify, which is worth seeing in logs.
    console.log(`[indexnow] ${res.status} for ${urlList.length} url(s)`);
  } catch (err) {
    console.warn('[indexnow] ping failed (ignored)', err);
  }
}
