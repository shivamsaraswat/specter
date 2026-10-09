import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DiagramEditorContext } from './DiagramEditorProvider.js';
import { LeaveGuard } from './LeaveGuard.js';
import { MODEL, fakeEditor } from './test-helpers.js';

// FR-020, FR-001b: leaving the threat model with unsaved changes asks first; moving between its two
// tabs does not.

function setup(pendingCount: number) {
  const base = `/threat-models/${MODEL}`;
  const router = createMemoryRouter(
    [
      {
        path: '/threat-models/:threatModelId',
        element: (
          <DiagramEditorContext.Provider value={fakeEditor({ pendingCount })}>
            <LeaveGuard />
            <Link to={`${base}`}>Threats tab</Link>
            <Link to={`${base}/diagram`}>Diagram tab</Link>
            <Link to={`${base}?status=open`}>Filtered threats</Link>
            <Link to="/projects">Projects</Link>
            <Outlet />
          </DiagramEditorContext.Provider>
        ),
        children: [
          { index: true, element: <p>threats page</p> },
          { path: 'diagram', element: <p>diagram page</p> },
        ],
      },
      { path: '/projects', element: <p>projects page</p> },
    ],
    { initialEntries: [`${base}/diagram`] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('leaving the threat model with unsaved changes', () => {
  it('asks first, says how many changes are at stake, and has Stay as the safe choice', async () => {
    const router = setup(2);
    const user = userEvent.setup();

    await user.click(screen.getByRole('link', { name: 'Projects' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Leave without saving?');
    expect(dialog.textContent).toContain('2 unsaved changes');
    expect(router.state.location.pathname).toBe(`/threat-models/${MODEL}/diagram`);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Stay' }));
  });

  it('stays on the page when told to stay', async () => {
    const router = setup(1);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Projects' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stay' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe(`/threat-models/${MODEL}/diagram`);
  });

  it('leaves when told to leave', async () => {
    const router = setup(1);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Projects' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }));

    expect(router.state.location.pathname).toBe('/projects');
    expect(await screen.findByText('projects page')).toBeTruthy();
  });

  it('uses the singular for one change', async () => {
    setup(1);
    await userEvent.setup().click(screen.getByRole('link', { name: 'Projects' }));
    expect(screen.getByRole('dialog').textContent).toContain('1 unsaved change.');
  });
});

describe('moving about without anything to lose', () => {
  it('does not ask when nothing is unsaved', async () => {
    const router = setup(0);
    await userEvent.setup().click(screen.getByRole('link', { name: 'Projects' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/projects');
  });

  it('does not ask for a move between the Diagram and Threats tabs, even with unsaved changes', async () => {
    const router = setup(3);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Threats tab' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe(`/threat-models/${MODEL}`);
    await user.click(screen.getByRole('link', { name: 'Diagram tab' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe(`/threat-models/${MODEL}/diagram`);
  });
});

// The threat list keeps its filters in the address (Phase 2 M4), so choosing one is a navigation. It stays inside
// the threat model, so it must never ask about unsaved diagram changes.
describe('filtering the threat list with unsaved changes', () => {
  it('does not ask for a move that changes only the query string', async () => {
    const router = setup(3);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Threats tab' }));
    await user.click(screen.getByRole('link', { name: 'Filtered threats' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe(`/threat-models/${MODEL}`);
    expect(router.state.location.search).toBe('?status=open');
  });

  it('still asks for a move out of the threat model', async () => {
    setup(3);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Filtered threats' }));
    await user.click(screen.getByRole('link', { name: 'Projects' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('closing or reloading the tab', () => {
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('asks the browser to warn while changes are unsaved', () => {
    setup(2);
    expect(unload()).toBe(true);
  });

  it('does not while everything is saved', () => {
    setup(0);
    expect(unload()).toBe(false);
  });
});
