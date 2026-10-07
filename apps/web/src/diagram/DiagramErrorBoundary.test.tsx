import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagramErrorBoundary } from './DiagramErrorBoundary.js';
import { DiagramEditorContext } from './DiagramEditorProvider.js';
import { MODEL, fakeEditor } from './test-helpers.js';

// FR-020, SC-005: if the diagram's own screen breaks, the user is told, in words, what happened to their
// unsaved changes. The editor above it keeps saving, so nothing they did is lost to the crash.

let broken = true;
function Fragile() {
  if (broken) throw new Error('boom');
  return <p>the diagram</p>;
}

function show(pendingCount: number) {
  return render(
    <MemoryRouter>
      <DiagramEditorContext.Provider value={fakeEditor({ pendingCount })}>
        <DiagramErrorBoundary>
          <Fragile />
        </DiagramErrorBoundary>
      </DiagramEditorContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  broken = true;
  // React logs the error it catches; the test expects it.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('the diagram stopped working', () => {
  it('says so as an alert, in plain words, without the error itself', () => {
    show(0);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The diagram stopped working.');
    expect(alert.textContent).not.toContain('boom');
    expect(screen.queryByText('the diagram')).toBeNull();
  });

  it('says how many unsaved changes are still being saved', () => {
    show(3);
    expect(screen.getByRole('alert').textContent).toContain('Your 3 unsaved changes are still being saved.');
  });

  it('says one change in the singular, and nothing about changes when there are none', () => {
    const view = show(1);
    expect(screen.getByRole('alert').textContent).toContain('Your 1 unsaved change is still being saved.');
    view.unmount();
    show(0);
    expect(screen.getByRole('alert').textContent).not.toContain('unsaved');
  });

  it('shows the diagram again when asked, if it works now', async () => {
    show(2);
    broken = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show the diagram again' }));
    expect(screen.getByText('the diagram')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers a reload, and the Threats tab, which does not need the diagram', () => {
    show(0);
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the Threats tab' }).getAttribute('href')).toBe(`/threat-models/${MODEL}`);
  });
});
