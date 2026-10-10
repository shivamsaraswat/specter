import type { ReportFormat } from '@specter/core';
import { useState } from 'react';
import { apiFetch } from '../api/client.js';
import { ApiError, isGone, toApiError } from '../api/errors.js';
import { useDiagramEditor } from '../diagram/DiagramEditorProvider.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { ErrorSummary } from './ErrorSummary.js';

// The download buttons for a threat model's report (contracts/web-ui.md; spec FR-001, FR-017). The server makes the
// document; this asks for it with the bearer token, as any API client would, and hands the body to the browser as a
// file. Nothing is kept: the document is not cached, stored or put in an address.

// Typed by core's list of formats, so a format the API gains is a type error here until it has a button.
const FORMATS: { format: ReportFormat; label: string; extension: string }[] = [
  { format: 'markdown', label: 'Download Markdown report', extension: 'md' },
  { format: 'html', label: 'Download HTML report (print or save as PDF)', extension: 'html' },
];

// The name the server chose, from `Content-Disposition: attachment; filename="..."`. A path separator in it would be
// the server's mistake, but a file name must never be able to leave the downloads folder.
function nameFrom(header: string | null): string | null {
  const name = header === null ? null : /filename="([^"]+)"/.exec(header)?.[1];
  return name === undefined || name === null ? null : name.replaceAll(/[\\/]/g, '-');
}

async function download(threatModelId: string, { format, extension }: { format: ReportFormat; extension: string }): Promise<void> {
  const res = await apiFetch(`/api/v1/threat-models/${threatModelId}/report?format=${format}`);
  if (!res.ok) throw await toApiError(res);
  const blob = await res.blob();
  const name = nameFrom(res.headers.get('Content-Disposition')) ?? `threat-model-report-${new Date().toISOString().slice(0, 10)}.${extension}`;
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

function failureText(err: unknown): string {
  if (isGone(err)) return 'This threat model no longer exists.';
  if (err instanceof ApiError) return err.message;
  return 'The report could not be downloaded. Try again.';
}

export function ExportReport({ threatModelId }: { threatModelId: string }) {
  const { pendingCount } = useDiagramEditor();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<(typeof FORMATS)[number] | null>(null);

  async function run(chosen: (typeof FORMATS)[number]): Promise<void> {
    setConfirming(null);
    setBusy(true);
    setError(null);
    setMessage('Preparing report…');
    try {
      await download(threatModelId, chosen);
      setMessage('Report downloaded.');
    } catch (err) {
      setMessage('');
      setError(failureText(err));
    } finally {
      setBusy(false);
    }
  }

  // A report shows what the server holds, so with diagram changes still on their way the user is asked first.
  function onClick(chosen: (typeof FORMATS)[number]): void {
    if (pendingCount > 0) setConfirming(chosen);
    else void run(chosen);
  }

  return (
    <div className="report-bar" role="group" aria-label="Report">
      {FORMATS.map((chosen) => (
        <button key={chosen.format} type="button" disabled={busy} onClick={() => onClick(chosen)}>
          {chosen.label}
        </button>
      ))}
      <p role="status">{message}</p>
      <ErrorSummary message={error} />
      {confirming && (
        <ConfirmDialog
          title="Download report?"
          message="Some diagram changes aren't saved yet. The report shows only what is saved."
          confirmLabel="Download anyway"
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
