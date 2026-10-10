import { apiFetch } from './client.js';
import { toApiError } from './errors.js';

// Saves what an API operation answers as a file, for the report and export buttons. The body is fetched with the bearer
// token, as any API client would, and handed to the browser as a Blob. Nothing is kept: the document is not cached,
// stored or put in an address.

// The name the server chose, from `Content-Disposition: attachment; filename="..."`. A path separator in it would be
// the server's mistake, but a file name must never be able to leave the downloads folder.
export function nameFrom(header: string | null): string | null {
  const name = header === null ? null : /filename="([^"]+)"/.exec(header)?.[1];
  return name === undefined || name === null ? null : name.replaceAll(/[\\/]/g, '-');
}

export async function download(path: string, fallbackName: string): Promise<void> {
  const res = await apiFetch(path);
  if (!res.ok) throw await toApiError(res);
  const blob = await res.blob();
  const name = nameFrom(res.headers.get('Content-Disposition')) ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // After the browser has taken the click: revoking at once can cancel a download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
