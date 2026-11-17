/**
 * RFC 4180 CSV, safe to open in a spreadsheet.
 *
 * Pure and dependency-free: the web app imports it too, for the dashboard's
 * chart export, so both exports escape the same way.
 */

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvValue;
}

/**
 * A cell starting with one of these is read as a formula by Excel, LibreOffice
 * and Google Sheets. Message text is written by other people, so `=HYPERLINK(…)`
 * or `@SUM(…)` in a chat must stay text. Tab and carriage return are on the
 * OWASP list too: some importers strip them and then see the formula.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  // Real numbers are data, and a negative one must stay a number.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  const text = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CRLF line endings and a BOM, so Excel reads UTF-8 (emoji, Hebrew, …) correctly. */
export function toCsv<Row>(columns: Array<CsvColumn<Row>>, rows: Iterable<Row>): string {
  const lines = [columns.map((column) => escapeCsvCell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(column.value(row))).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
