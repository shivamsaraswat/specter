import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagramEditorContext } from '../diagram/DiagramEditorProvider.js';
import { MODEL, fakeEditor } from '../diagram/test-helpers.js';
import { installFakeApi, json } from '../test-utils.js';
import { ExportReport } from './ExportReport.js';

// contracts/web-ui.md: the two download buttons on the threat model page.

const REPORT = 'GET /api/v1/threat-models/:id/report';
const MARKDOWN = '# Threat model report: Payments API\n';

function file(body: string, name = 'payments-api-report-2026-10-10.md', type = 'text/markdown; charset=utf-8'): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"` } });
}

interface Clicked {
  download: string;
  href: string;
}

let clicked: Clicked[];
let blobs: Blob[];
let revoked: string[];
// Never reset: the component revokes a link a second after the click, so one from an earlier test can still arrive. A
// name of its own tells this test's link from those.
let made = 0;

beforeEach(() => {
  clicked = [];
  blobs = [];
  revoked = [];
  // jsdom can navigate to nothing, so a click on the download link is only recorded.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.href });
  });
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return `blob:fake-${++made}`;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(handlers: Parameters<typeof installFakeApi>[0], editor = fakeEditor()) {
  const api = installFakeApi(handlers);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DiagramEditorContext.Provider value={editor}>
        <ExportReport threatModelId={MODEL} />
      </DiagramEditorContext.Provider>
    </QueryClientProvider>,
  );
  return { api, editor };
}

const markdownButton = () => screen.getByRole('button', { name: 'Download Markdown report' });
const htmlButton = () => screen.getByRole('button', { name: 'Download HTML report (print or save as PDF)' });
// What was asked for, as the browser was given it (the fake API keeps only the path).
const requestedUrls = (api: ReturnType<typeof installFakeApi>): string[] =>
  api.fetchMock.mock.calls.map(([input]) => (typeof input === 'string' ? input : '')).filter((url) => url.includes('/report'));
const status = () => screen.getByRole('status');

describe('ExportReport', () => {
  it('has a group named Report holding the Markdown button', () => {
    setup({});
    const group = screen.getByRole('group', { name: 'Report' });
    expect(within(group).getByRole('button', { name: 'Download Markdown report' })).toBeTruthy();
    expect(status().textContent).toBe('');
  });

  it('has the HTML button beside it, named for what it is for', () => {
    setup({});
    expect(within(screen.getByRole('group', { name: 'Report' })).getByRole('button', { name: 'Download HTML report (print or save as PDF)' })).toBeTruthy();
  });

  it('asks the API for the HTML report, and saves it as an HTML file', async () => {
    const { api } = setup({ [REPORT]: () => file('<!doctype html>\n', 'payments-api-report-2026-10-10.html', 'text/html; charset=utf-8') });
    await userEvent.click(htmlButton());
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(requestedUrls(api)).toEqual([`/api/v1/threat-models/${MODEL}/report?format=html`]);
    expect(clicked[0]?.download).toBe('payments-api-report-2026-10-10.html');
    expect(blobs[0]?.type).toBe('text/html;charset=utf-8');
  });

  it('falls back to an .html name of its own if the server gave none', async () => {
    setup({ [REPORT]: () => new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) });
    await userEvent.click(htmlButton());
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]?.download).toMatch(/^threat-model-report-\d{4}-\d{2}-\d{2}\.html$/);
  });

  it('disables both buttons while either report is being made', async () => {
    let release: (response: Response) => void = () => undefined;
    setup({ [REPORT]: () => new Promise<Response>((resolve) => (release = resolve)) });
    await userEvent.click(htmlButton());
    expect((markdownButton() as HTMLButtonElement).disabled).toBe(true);
    expect((htmlButton() as HTMLButtonElement).disabled).toBe(true);
    release(file('<!doctype html>', 'x.html', 'text/html; charset=utf-8'));
    await waitFor(() => expect((htmlButton() as HTMLButtonElement).disabled).toBe(false));
    expect((markdownButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('asks the API for the Markdown report of this threat model, with the bearer token and no other credential', async () => {
    const { api } = setup({ [REPORT]: () => file(MARKDOWN) });
    await userEvent.click(markdownButton());
    await waitFor(() => expect(status().textContent).toBe('Report downloaded.'));
    const requested = (input: unknown): string => (typeof input === 'string' ? input : '');
    const asked = api.fetchMock.mock.calls.find(([input]) => requested(input).includes('/report'));
    expect(requested(asked?.[0])).toBe(`/api/v1/threat-models/${MODEL}/report?format=markdown`);
    expect(new Headers(asked?.[1]?.headers).get('Authorization')).toBe('Bearer test-token');
    expect(api.callsTo('GET', `/api/v1/threat-models/${MODEL}/report`)).toHaveLength(1);
  });

  it('is disabled and says the report is being prepared while the request is open', async () => {
    let release: (response: Response) => void = () => undefined;
    setup({ [REPORT]: () => new Promise<Response>((resolve) => (release = resolve)) });
    await userEvent.click(markdownButton());
    expect((markdownButton() as HTMLButtonElement).disabled).toBe(true);
    expect(status().textContent).toBe('Preparing report…');
    release(file(MARKDOWN));
    await waitFor(() => expect((markdownButton() as HTMLButtonElement).disabled).toBe(false));
    expect(status().textContent).toBe('Report downloaded.');
  });

  it('saves the body under the name the server gave, and revokes the link afterwards', async () => {
    setup({ [REPORT]: () => file(MARKDOWN, 'my-model-report-2026-10-10.md') });
    await userEvent.click(markdownButton());
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]).toEqual({ download: 'my-model-report-2026-10-10.md', href: `blob:fake-${made}` });
    // A Blob's type is the MIME type serialised, which has no space after the semicolon.
    expect(blobs[0]?.type).toBe('text/markdown;charset=utf-8');
    expect(await blobs[0]?.text()).toBe(MARKDOWN);
    await waitFor(() => expect(revoked).toContain(`blob:fake-${made}`));
  });

  it('falls back to a name of its own if the server gave none', async () => {
    setup({ [REPORT]: () => new Response(MARKDOWN, { status: 200, headers: { 'Content-Type': 'text/markdown' } }) });
    await userEvent.click(markdownButton());
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]?.download).toMatch(/^threat-model-report-\d{4}-\d{2}-\d{2}\.md$/);
  });

  describe('with diagram changes that are not saved', () => {
    const unsaved = () => fakeEditor({ pendingCount: 2, status: 'saving' });

    it('asks first, and downloads nothing on Cancel', async () => {
      const { api } = setup({ [REPORT]: () => file(MARKDOWN) }, unsaved());
      await userEvent.click(markdownButton());
      const dialog = document.querySelector('dialog') as HTMLElement;
      expect(dialog.textContent).toContain('Download report?');
      expect(dialog.textContent).toContain("Some diagram changes aren't saved yet. The report shows only what is saved.");
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(document.querySelector('dialog')).toBeNull();
      expect(api.callsTo('GET', `/api/v1/threat-models/${MODEL}/report`)).toHaveLength(0);
      expect(clicked).toHaveLength(0);
    });

    it('downloads on "Download anyway"', async () => {
      setup({ [REPORT]: () => file(MARKDOWN) }, unsaved());
      await userEvent.click(markdownButton());
      await userEvent.click(within(document.querySelector('dialog') as HTMLElement).getByRole('button', { name: 'Download anyway' }));
      await waitFor(() => expect(clicked).toHaveLength(1));
    });

    it('asks before the HTML report too, and downloads the format that was chosen', async () => {
      const { api } = setup({ [REPORT]: () => file('<!doctype html>', 'x.html', 'text/html; charset=utf-8') }, unsaved());
      await userEvent.click(htmlButton());
      expect(document.querySelector('dialog')?.textContent).toContain('Download report?');
      expect(requestedUrls(api)).toEqual([]);
      await userEvent.click(within(document.querySelector('dialog') as HTMLElement).getByRole('button', { name: 'Download anyway' }));
      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(requestedUrls(api)).toEqual([`/api/v1/threat-models/${MODEL}/report?format=html`]);
    });

    it('does not ask when everything is saved', async () => {
      setup({ [REPORT]: () => file(MARKDOWN) });
      await userEvent.click(markdownButton());
      expect(document.querySelector('dialog')).toBeNull();
      await waitFor(() => expect(clicked).toHaveLength(1));
    });
  });

  describe('when the report cannot be made', () => {
    it('says the threat model is gone on a 404, and downloads nothing', async () => {
      setup({ [REPORT]: () => json(404, { error: 'Threat model not found' }) });
      await userEvent.click(markdownButton());
      expect((await screen.findByRole('alert')).textContent).toBe('This threat model no longer exists.');
      expect(clicked).toHaveLength(0);
      expect(blobs).toHaveLength(0);
      expect(status().textContent).toBe('');
      expect((markdownButton() as HTMLButtonElement).disabled).toBe(false);
    });

    it("shows the server's message on any other error, and downloads nothing", async () => {
      setup({ [REPORT]: () => json(500, { error: 'Internal server error' }) });
      await userEvent.click(markdownButton());
      expect((await screen.findByRole('alert')).textContent).toBe('Internal server error');
      expect(clicked).toHaveLength(0);
    });

    it('clears an old error when the next download starts', async () => {
      let first = true;
      setup({
        [REPORT]: () => {
          if (first) {
            first = false;
            return json(500, { error: 'Internal server error' });
          }
          return file(MARKDOWN);
        },
      });
      await userEvent.click(markdownButton());
      await screen.findByRole('alert');
      await userEvent.click(markdownButton());
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      await waitFor(() => expect(clicked).toHaveLength(1));
    });
  });
});
