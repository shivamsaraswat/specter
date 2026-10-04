import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, emitSessionEnded } from '../api/session.js';
import { RequireSession } from '../session/RequireSession.js';
import { SessionProvider } from '../session/SessionProvider.js';
import { LoginPage } from './LoginPage.js';

// The sign-in page (contracts/ui.md, "Sign in").
const fetchMock = vi.fn<typeof fetch>();

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const sessionBody = {
  access_token: 'tok',
  expires_at: new Date(Date.now() + 300_000).toISOString(),
  account: { id: 7, username: 'ada' },
};

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

// The boot-time renewal finds no session, so the page starts signed out.
function signedOutServer(signIn: () => Response): void {
  fetchMock.mockImplementation((input) =>
    Promise.resolve(urlOf(input) === '/api/session/refresh' ? json(401, { error: 'Session ended' }) : signIn()),
  );
}

function setup(entry: string | { pathname: string; state?: unknown } = '/login') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <SessionProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireSession />}>
              <Route path="/projects" element={<p>projects page</p>} />
              <Route path="/projects/:id" element={<p>deep page</p>} />
            </Route>
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function submit(username: string, password: string): Promise<void> {
  await userEvent.type(await screen.findByLabelText('Username'), username);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  clearAccessToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('has labelled Username and Password fields, and a password manager hint', async () => {
    signedOutServer(() => json(401));
    setup();
    const password = await screen.findByLabelText('Password');
    expect(password.getAttribute('type')).toBe('password');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByLabelText('Username').getAttribute('autocomplete')).toBe('username');
  });

  it('shows one generic message on a 401, keeps the username and clears the password', async () => {
    signedOutServer(() => json(401, { error: 'Invalid credentials' }));
    setup();

    await submit('ada', 'wrong');

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid username or password.');
    expect(screen.getByLabelText<HTMLInputElement>('Username').value).toBe('ada');
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('');
  });

  it('shows the throttling message on a 429', async () => {
    signedOutServer(() => json(429, { error: 'Too many sign-in attempts. Try again later.' }));
    setup();

    await submit('ada', 'wrong');

    expect((await screen.findByRole('alert')).textContent).toBe('Too many sign-in attempts. Try again later.');
  });

  it('goes to the project list after signing in', async () => {
    signedOutServer(() => json(200, sessionBody));
    setup();

    await submit('ada', 'right');

    expect(await screen.findByText('projects page')).toBeTruthy();
  });

  it('returns to the page the user originally asked for', async () => {
    signedOutServer(() => json(200, sessionBody));
    setup({ pathname: '/login', state: { from: { pathname: '/projects/abc', search: '?tab=2', hash: '' } } });

    await submit('ada', 'right');

    expect(await screen.findByText('deep page')).toBeTruthy();
  });

  it('sends a signed-in user who opens /login to the project list', async () => {
    fetchMock.mockResolvedValue(json(200, sessionBody));
    setup();
    expect(await screen.findByText('projects page')).toBeTruthy();
  });

  it('does not say the session has ended on a first visit, or after an explicit logout', async () => {
    signedOutServer(() => json(401));
    setup();
    await screen.findByLabelText('Username');
    expect(screen.queryByText(/session has ended/)).toBeNull();
  });

  it('says so, in its own words, when a session that was in use dies', async () => {
    fetchMock.mockResolvedValue(json(200, sessionBody));
    setup('/projects');
    // Signed in at boot, then the session dies mid-use.
    await screen.findByText('projects page');
    emitSessionEnded();
    expect(await screen.findByText("Your session has ended. Anything you hadn't saved was not kept.")).toBeTruthy();
  });
});
