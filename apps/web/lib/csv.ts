// Minimal RFC-4180-ish CSV serialize/parse for the tests round-trip. No dependency: the shape we
// need (quoted fields, embedded commas/quotes/newlines, CRLF, optional BOM) is small and stable,
// and Excel is the primary editor we're targeting.

/** Serialize rows to CSV. Prepends a UTF-8 BOM so Excel opens it with correct encoding. */
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const escape = (v: string | number | boolean | null | undefined): string => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map((r) => r.map(escape).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/**
 * Parse CSV text into an array of records keyed by the header row. Handles quoted fields (embedded
 * commas, quotes, newlines), CR/CRLF/LF, and a leading BOM. Rows shorter than the header get ''
 * for missing cells; fully-empty rows are skipped.
 */
export function parseCsv(text: string): { header: string[]; records: Record<string, string>[] } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\n') {
      endRow();
    } else if (c === '\r') {
      if (src[i + 1] === '\n') i++;
      endRow();
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) endRow();

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) return { header: [], records: [] };

  const header = nonEmpty[0]!.map((h) => h.trim().toLowerCase());
  const records = nonEmpty.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => { rec[h] = (r[idx] ?? '').trim(); });
    return rec;
  });
  return { header, records };
}
