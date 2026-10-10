# Contract: Web UI for reports

## Where

`ExportReport` (`apps/web/src/components/ExportReport.tsx`) is rendered by `ThreatModelPage` inside
`DiagramEditorProvider`, next to `GenerateThreats`. It appears on both the Diagram and Threats views
(FR-001), and it can read the editor's save state.

```text
┌ Threat model: Payments API ──────────────────────────────────────────┐
│ Methodology: STRIDE   Status [In review ▾]   [Edit] [Delete]         │
│ [Generate threats]   Report: [Download Markdown] [Download HTML]     │
│ ( Diagram | Threats )                                                │
```

## Controls

| Control | Accessible name | Behaviour |
|---|---|---|
| A group labelled "Report" | `role="group"`, `aria-label="Report"` | holds the two buttons |
| Download Markdown | "Download Markdown report" | `GET …/report?format=markdown`, then save the file (research #14) |
| Download HTML | "Download HTML report (print or save as PDF)" | `GET …/report?format=html`, then save the file |
| Status line | `role="status"`, `aria-live="polite"` | "Preparing report…" while a download runs; "Report downloaded." when it finishes; empty otherwise |

## States

| State | What the user sees |
|---|---|
| Idle | both buttons enabled |
| Downloading | both buttons disabled; the status says "Preparing report…" |
| The editor has unsaved changes (`pendingCount > 0`, as in `LeaveGuard`; failed saves stay pending) | a click opens `ConfirmDialog`: title "Download report?", message "Some diagram changes aren't saved yet. The report shows only what is saved.", confirm "Download anyway", cancel "Cancel". Cancel downloads nothing. |
| Error 404 | the existing error banner: "This threat model no longer exists." Nothing is downloaded. |
| Other error | the existing error banner with the error's message (`ApiError`). Nothing is downloaded. |
| Session ended | the existing session-ended flow (`apiFetch`) |

## The file

- **Name**: from the response's `Content-Disposition` (research #13).
- **Content**: exactly the response body, saved as a `Blob` with the response's content type.
- **Afterwards**: the object URL is revoked once the click has happened. Nothing is put in browser
  storage, the query cache or the address bar (FR-017).

## Not in this milestone

- An in-app preview of the report, a choice of sections, or a "print" button. The HTML file is
  printed from the browser that opens it (FR-023).

## Tests

- **`ExportReport.test.tsx`** (Vitest, fake API):
  - both buttons are present;
  - a click requests the right format;
  - the buttons are disabled and the status shows while a download runs;
  - the confirm dialog appears with pending saves, and cancelling it downloads nothing;
  - 404 and 500 errors show their messages;
  - the file name comes from the header.
- **`report.spec.ts`** (Playwright): quickstart §2.
