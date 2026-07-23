// Shared helpers for reading admin bulk-edit workbooks (Tests, Discovered). Both importers need the
// same "cell value -> plain text" normalization and "row 1 = header" parsing, so it lives here once
// instead of drifting between copies.
import ExcelJS from 'exceljs';

/** Plain text out of any ExcelJS cell value shape (string, number, Date, formula result, rich text,
 * hyperlink object) — TEXT-formatted columns (e.g. lab codes) never arrive as numbers in the first
 * place, but this stays defensive against a user retyping into a re-formatted cell anyway. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((t) => t.text).join('').trim();
    if ('result' in value) return cellText(value.result ?? '');
    if ('text' in value) return String(value.text).trim();
  }
  return String(value).trim();
}

/** Reads a named worksheet's row 1 as headers (lowercased) and every subsequent non-blank row into a
 * {header: value} record — the shape the CSV-era importers were already written against, so parsing
 * logic downstream of this needs zero changes when the source format changes. */
export async function parseWorkbookSheet(
  buffer: ArrayBuffer,
  sheetName: string,
): Promise<{ header: string[]; records: Record<string, string>[] } | { error: string }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    return { error: `No '${sheetName}' sheet found — upload the file exactly as exported (or make sure a sheet is literally named '${sheetName}').` };
  }

  const header: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    header[colNumber - 1] = cellText(cell.value).toLowerCase();
  });

  const records: Record<string, string>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const rec: Record<string, string> = {};
    let hasValue = false;
    header.forEach((h, i) => {
      if (!h) return;
      const text = cellText(row.getCell(i + 1).value);
      rec[h] = text;
      if (text) hasValue = true;
    });
    if (hasValue) records.push(rec);
  }
  return { header, records };
}
