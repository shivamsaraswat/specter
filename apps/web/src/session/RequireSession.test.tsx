import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, emitSessionEnded } from '../api/session.js';
import { RequireSession } from './RequireSession.js';
import { SessionProvider, useSession } from './SessionProvider.js';

// The guard and the provider behind it (spec FR-018, research #15). A visit that finds no session is
// just "not signed in": the "session has ended" message is only for a session that dies mid-use.
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

function LoginProbe() {
  const location = useLocation();
  const { endedMessage } = useSession();
  const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from;
  return (
    <div>
      <p>login page</p>
      <p data-testid="from">{from ? `${from.pathname}${from.search}` : 'none'}</p>
      <p data-testid="search">{location.search || 'empty'}</p>
      <p data-testid="ended">{endedMessage ?? 'no message'}</p>
    </div>
  );
}

function setup(initial: string) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <SessionProvider>
          <Routes>
            <Route path="/login" element={<LoginProbe />} />
            <Route element={<RequireSession />}>
              <Route path="/projects/:id" element={<p>protected page</p>} />
            </Route>
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  clearAccessToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequireSession', () => {
  it('shows the protected page when the boot-time renewal restores a session', async () => {
    fetchMock.mockResolvedValue(json(200, sessionBody));
    setup('/projects/abc');
    expect(await screen.findByText('protected page')).toBeTruthy();
  });

  it('redirects to the sign-in page when there is no session, keeping the original location in router state only', async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'Session ended' }));
    setup('/projects/abc?tab=2');

    expect(await screen.findByText('login page')).toBeTruthy();
    expect(screen.getByTestId('from').textContent).toBe('/projects/abc?tab=2');
    expect(screen.getByTestId('search').textContent).toBe('empty');
  });

  it('shows "Loading…" while the boot-time renewal is in flight', async () => {
    let release: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));
    setup('/projects/abc');
    expect(screen.getByText('Loading…')).toBeTruthy();

    // Let the renewal settle, so it doesn't stay in flight for the tests that follow.
    release(json(401, { error: 'Session ended' }));
    await screen.findByText('login page');
  });
});

describe('the "session has ended" message', () => {
  it('is not shown on a first visit with no cookie', async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'Session ended' }));
    setup('/projects/abc');
    await screen.findByText('login page');
    expect(screen.getByTestId('ended').textContent).toBe('no message');
  });

  it('is shown only when a session that was signed in dies mid-use', async () => {
    fetchMock.mockResolvedValue(json(200, sessionBody));
    setup('/projects/abc');
    await screen.findByText('protected page');

    emitSessionEnded();

    await waitFor(() => expect(screen.getByTestId('ended').textContent).toMatch(/Your session has ended/));
    expect(screen.getByTestId('ended').textContent).toBe(
      "Your session has ended. Anything you hadn't saved was not kept.",
    );
  });

  it('is not shown after an explicit logout, and the original location is not carried to the next sign-in', async () => {
    fetchMock.mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(url.endsWith('/logout') ? new Response(null, { status: 204 }) : json(200, sessionBody));
    });
    function LogoutButton() {
      const { logout } = useSession();
      return <button onClick={() => void logout()}>log out now</button>;
    }
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/projects/abc']}>
          <SessionProvider>
            <Routes>
              <Route path="/login" element={<LoginProbe />} />
              <Route element={<RequireSession />}>
                <Route path="/projects/:id" element={<LogoutButton />} />
              </Route>
            </Routes>
          </SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    (await screen.findByText('log out now')).click();

    await screen.findByText('login page');
    expect(screen.getByTestId('ended').textContent).toBe('no message');
    expect(screen.getByTestId('from').textContent).toBe('none');
  });
});
