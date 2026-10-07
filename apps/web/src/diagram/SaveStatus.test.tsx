import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { MODEL_ID, PROJECT_ID, installFakeApi, json, project, threatModel } from '../test-utils.js';
import { DiagramEditorContext } from './DiagramEditorProvider.js';
import { SaveStatus } from './SaveStatus.js';
import { fakeEditor } from './test-helpers.js';
import { render } from '@testing-library/react';

// FR-020, FR-026: the editor always says whether the latest changes are saved.

function show(overrides: Parameters<typeof fakeEditor>[0]) {
  const editor = fakeEditor(overrides);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DiagramEditorContext.Provider value={editor}>
          <SaveStatus />
        </DiagramEditorContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return editor;
}

describe('SaveStatus', () => {
  it('says "All changes saved" when nothing is waiting', () => {
    show({ status: 'saved', pendingCount: 0 });
    expect(screen.getByText('All changes saved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('says "Saving…" while a change is on its way', () => {
    show({ status: 'saving', pendingCount: 2 });
    expect(screen.getByText('Saving…')).toBeTruthy();
  });

  it('announces the saved and saving states politely, in a live region', () => {
    show({ status: 'saving', pendingCount: 1 });
    expect(screen.getByText('Saving…').closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('says "Not saved" as an alert, with a Retry that retries, when a change failed', async () => {
    const editor = show({ status: 'failed', pendingCount: 3 });
    const user = userEvent.setup();

    expect(screen.getByRole('alert').textContent).toContain('Not saved');
    expect(screen.getByRole('alert').textContent).toContain('3 changes');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(editor.retry).toHaveBeenCalledTimes(1);
  });

  it('counts one change in the singular', () => {
    show({ status: 'failed', pendingCount: 1 });
    expect(screen.getByRole('alert').textContent).toContain('1 change');
    expect(screen.getByRole('alert').textContent).not.toContain('1 changes');
  });

  it('says the threat model no longer exists, with a way back to its project, when it was deleted elsewhere', async () => {
    installFakeApi({
      [`GET /api/v1/threat-models/${MODEL_ID}`]: () => json(200, threatModel()),
      [`GET /api/v1/projects/${PROJECT_ID}`]: () => json(200, project({ name: 'Payments' })),
    });
    show({ status: 'gone', pendingCount: 0, threatModelId: MODEL_ID });
    expect(screen.getByRole('alert').textContent).toContain('This threat model no longer exists.');
    const link = await screen.findByRole('link', { name: 'Back to Payments' });
    expect(link.getAttribute('href')).toBe(`/projects/${PROJECT_ID}`);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('offers the project list when the project is not known', () => {
    installFakeApi({
      [`GET /api/v1/threat-models/${MODEL_ID}`]: () => json(404, { error: 'Threat model not found' }),
    });
    show({ status: 'gone', pendingCount: 0, threatModelId: MODEL_ID });
    expect(screen.getByRole('link', { name: 'Back to projects' }).getAttribute('href')).toBe('/projects');
  });
});
