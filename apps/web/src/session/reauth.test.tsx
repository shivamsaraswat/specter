import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitSessionEnded } from '../api/session.js';
import { AppShell } from '../components/AppShell.js';
import { LoginPage } from '../pages/LoginPage.js';
import { installFakeApi, json } from '../test-utils.js';
import { RequireSession } from './RequireSession.js';
import { SessionProvider, useSession } from './SessionProvider.js';

// FR-020d, research #10: when the session ends with unsaved diagram changes, the page stays, a sign-in
// prompt opens over it, and only the same account can sign in to save them.

const SESSION_OF = (id: number, username: string) => ({
  access_token: `token-${id}`,
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  account: { id, username },
});

// What the page under test reports about the session, so a test can wait until its unsaved work is counted.
let unsavedNow: (() => number) | null = null;

// A page that has unsaved work, as the diagram editor does.
function Page({ count, onResumed }: { count: number; onResumed: () => void }) {
  const { registerUnsavedWork, unsavedCount } = useSession();
  useEffect(() => {
    unsavedNow = unsavedCount;
    return registerUnsavedWork({ count: () => count, onResumed });
  }, [registerUnsavedWork, unsavedCount, count, onResumed]);
  return <p>the diagram page</p>;
}

// How many unsaved changes the page under test has, set by setup().
let expectedUnsaved = 0;

// The page is up and its work is registered: ending the session now has something to save.
const pageReady = async () => {
  await screen.findByText('the diagram page');
  await waitFor(() => expect(unsavedNow?.()).toBe(expectedUnsaved));
};

function Root() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}

function setup({ count = 2, onResumed = vi.fn() }: { count?: number; onResumed?: () => void } = {}) {
  expectedUnsaved = count;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['elements', 'm'], ['kept']);
  const router = createMemoryRouter(
    [
      {
        element: <Root />,
        children: [
          { path: '/login', element: <LoginPage /> },
          {
            element: <RequireSession />,
            children: [{ element: <AppShell />, children: [{ path: '/projects', element: <Page count={count} onResumed={onResumed} /> }] }],
          },
        ],
      },
    ],
    { initialEntries: ['/projects'] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router, onResumed };
}

const endSession = () => emitSessionEnded();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a session that ends while changes are unsaved', () => {
  it('keeps the page and its data, and opens a sign-in prompt over it that says how many changes wait', async () => {
    installFakeApi();
    const { client, router } = setup({ count: 2 });
    await pageReady();
    expect(screen.getByText('the diagram page')).toBeTruthy();

    endSession();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Your session ended');
    expect(dialog.textContent).toContain('Sign in again to save your 2 changes.');
    expect(screen.getByText('the diagram page')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/projects');
    expect(client.getQueryData(['elements', 'm'])).toEqual(['kept']);
  });

  it('puts the username in the prompt, unchangeable, and asks only for the password', async () => {
    installFakeApi();
    setup();
    await pageReady();
    endSession();

    const dialog = await screen.findByRole('dialog');
    const username = within(dialog).getByLabelText<HTMLInputElement>('Username');
    expect(username.value).toBe('ada');
    expect(username.readOnly).toBe(true);
    expect(within(dialog).getByLabelText('Password')).toBeTruthy();
  });

  it('resumes the saving once the same account signs in again, and closes the prompt', async () => {
    const api = installFakeApi({ 'POST /api/session': () => json(200, SESSION_OF(7, 'ada')) });
    const { onResumed } = setup();
    await pageReady();
    endSession();
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Password'), 'correct horse');
    await user.click(within(dialog).getByRole('button', { name: 'Sign in and save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onResumed).toHaveBeenCalledTimes(1);
    expect(api.callsTo('POST', '/api/session')[0]?.body).toEqual({ username: 'ada', password: 'correct horse' });
    expect(screen.getByText('the diagram page')).toBeTruthy();
  });

  it('says the sign-in failed, keeps the prompt and the page, and does not resume, for a wrong password', async () => {
    installFakeApi({ 'POST /api/session': () => json(401, { error: 'Invalid username or password' }) });
    const { onResumed } = setup();
    await pageReady();
    endSession();
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Password'), 'wrong');
    await user.click(within(dialog).getByRole('button', { name: 'Sign in and save' }));

    expect(await within(dialog).findByText('Invalid username or password.')).toBeTruthy();
    expect(onResumed).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(dialog).getByLabelText<HTMLInputElement>('Password').value).toBe('');
  });

  it('treats a sign-in as another account as a discard: those changes are not written under its name', async () => {
    installFakeApi({ 'POST /api/session': () => json(200, SESSION_OF(99, 'ada')) });
    const { onResumed, router } = setup({ count: 3 });
    await pageReady();
    endSession();
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Password'), 'pw');
    await user.click(within(dialog).getByRole('button', { name: 'Sign in and save' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(onResumed).not.toHaveBeenCalled();
    expect(await screen.findByText('Your session ended before 3 diagram changes were saved. They were not saved.')).toBeTruthy();
  });

  it('lets the user discard instead, signing them out and telling them how many changes were lost', async () => {
    installFakeApi();
    const { client, router, onResumed } = setup({ count: 1 });
    await pageReady();
    endSession();
    const user = userEvent.setup();

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes and sign out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('Your session ended before 1 diagram change was saved. It was not saved.')).toBeTruthy();
    expect(onResumed).not.toHaveBeenCalled();
    expect(client.getQueryData(['elements', 'm'])).toBeUndefined();
  });
});

describe('a session that ends with nothing to save', () => {
  it('goes to the sign-in page as before, with the usual message, and clears the data', async () => {
    installFakeApi();
    const { client, router } = setup({ count: 0 });
    await pageReady();

    endSession();

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText("Your session has ended. Anything you hadn't saved was not kept.")).toBeTruthy();
    expect(client.getQueryData(['elements', 'm'])).toBeUndefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('forgets a page that has gone: its unsaved work no longer counts', async () => {
    installFakeApi();
    const { router } = setup({ count: 2 });
    await pageReady();
    await router.navigate('/login');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    endSession();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('signing out on purpose with unsaved changes', () => {
  it.each(['Log out', 'Sign out everywhere'])('asks first for "%s", and signs out only when told to', async (button) => {
    const api = installFakeApi({
      'POST /api/session/logout': () => json(204),
      'POST /api/session/logout-all': () => json(204),
    });
    const { router } = setup({ count: 2 });
    await pageReady();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: button }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Sign out without saving 2 changes?');
    expect(api.callsTo('POST', /logout/)).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Stay signed in' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.callsTo('POST', /logout/)).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/projects');
  });

  it('signs out when confirmed', async () => {
    const api = installFakeApi({ 'POST /api/session/logout': () => json(204) });
    const { router } = setup({ count: 2 });
    await pageReady();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(api.callsTo('POST', '/api/session/logout')).toHaveLength(1);
  });

  it('does not ask for "Log out" when nothing is unsaved', async () => {
    const api = installFakeApi({ 'POST /api/session/logout': () => json(204) });
    const { router } = setup({ count: 0 });
    await pageReady();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.callsTo('POST', '/api/session/logout')).toHaveLength(1);
  });
});
