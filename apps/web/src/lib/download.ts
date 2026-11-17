/**
 * Save a file the page already holds. Nothing leaves the machine: the blob URL
 * lives only in this tab and is revoked once the browser has started the save.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(text: string, filename: string, type: string): void {
  downloadBlob(new Blob([text], { type }), filename);
}

/** Local calendar date, for file names: `2026-11-16`. */
export function fileDate(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
