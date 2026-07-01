// Parse Next.js App Router "flight" data out of server-rendered HTML.
//
// WHY: GoodLabs is a Next.js RSC app. There's no JSON API and no __NEXT_DATA__; the real per-lab
// codes/prices/isPanel live inside `self.__next_f.push([1,"<escaped-json-chunk>"])` script tags.
// We decode those chunks (each is a JSON string literal), concatenate them, and pull structured
// objects out of the result. This keeps the scraper on plain HTTP — no browser, no CSS selectors.

/**
 * Decode and concatenate every self.__next_f.push([1,"..."]) chunk into one flight-text blob.
 * Each chunk is a valid JSON array `[1, "<string>"]`; JSON.parse un-escapes it correctly.
 */
export function decodeNextFlight(html: string): string {
  // Match [1,"...."] with proper JS-string escaping, or [1,null]. The string body allows escaped
  // chars (\\.) so embedded quotes/backslashes don't terminate the match early.
  const re = /self\.__next_f\.push\((\[\s*\d+\s*,\s*(?:"(?:[^"\\]|\\.)*"|null)\s*\])\)/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const arr = JSON.parse(m[1]!) as [number, string | null];
      if (typeof arr[1] === 'string') out += arr[1];
    } catch {
      // skip malformed chunk
    }
  }
  return out;
}

/**
 * Find `"<key>":{ ... }` in a text blob and return the parsed object via brace-matching that
 * respects string literals. Returns null if not found or not parseable.
 */
export function extractJsonObject(text: string, key: string): unknown | null {
  const marker = `"${key}":`;
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const start = text.indexOf('{', at + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let k = start; k < text.length; k++) {
    const c = text[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, k + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
