import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { clearAccessToken } from './api/session.js';

beforeEach(() => {
  clearAccessToken();
  // With no session, the boot-time renewal fails and the app shows the sign-in page.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'Session ended' }), { status: 401 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('shows the sign-in page when there is no session', async () => {
  render(<App />);
  expect(await screen.findByLabelText('Username')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
});
