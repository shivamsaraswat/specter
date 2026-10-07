import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { clearAccessToken } from './api/session.js';
import { MODEL_ID, PROJECT_ID, element, installFakeApi, json, project, renderApp, threatModel } from './test-utils.js';

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

describe('the threat model page has two tabs (FR-001, FR-001b)', () => {
  function fakeModelApi() {
    return installFakeApi({
      [`GET /api/v1/threat-models/${MODEL_ID}`]: () => json(200, threatModel()),
      [`GET /api/v1/projects/${PROJECT_ID}`]: () => json(200, project()),
      [`GET /api/v1/threat-models/${MODEL_ID}/elements`]: () => json(200, [element({ name: 'API gateway' })]),
      [`GET /api/v1/threat-models/${MODEL_ID}/threats`]: () => json(200, []),
      [`GET /api/v1/threat-models/${MODEL_ID}/mitigations`]: () => json(200, []),
    });
  }

  it('opens the Threats tab at /threat-models/:id, as before', async () => {
    fakeModelApi();
    renderApp(`/threat-models/${MODEL_ID}`);

    const tabs = await screen.findByRole('navigation', { name: 'Threat model views' });
    expect(within(tabs).getByRole('link', { name: 'Threats' }).getAttribute('aria-current')).toBe('page');
    expect(within(tabs).getByRole('link', { name: 'Diagram' }).getAttribute('aria-current')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Threats' })).toBeTruthy();
    expect(screen.queryByRole('application', { name: 'Data-flow diagram' })).toBeNull();
  });

  it('opens the Diagram tab at /threat-models/:id/diagram', async () => {
    fakeModelApi();
    renderApp(`/threat-models/${MODEL_ID}/diagram`);

    const tabs = await screen.findByRole('navigation', { name: 'Threat model views' });
    expect(within(tabs).getByRole('link', { name: 'Diagram' }).getAttribute('aria-current')).toBe('page');
    expect(within(tabs).getByRole('link', { name: 'Threats' }).getAttribute('aria-current')).toBeNull();
    expect(await screen.findByRole('application', { name: 'Data-flow diagram' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Threats' })).toBeNull();
  });

  it('switches between the tabs through their links', async () => {
    fakeModelApi();
    const user = userEvent.setup();
    renderApp(`/threat-models/${MODEL_ID}`);

    const tabs = await screen.findByRole('navigation', { name: 'Threat model views' });
    await user.click(within(tabs).getByRole('link', { name: 'Diagram' }));
    expect(await screen.findByRole('application', { name: 'Data-flow diagram' })).toBeTruthy();
    await user.click(within(tabs).getByRole('link', { name: 'Threats' }));
    expect(await screen.findByRole('heading', { name: 'Threats' })).toBeTruthy();
  });

  it('keeps showing a malformed id as a page that does not exist', async () => {
    fakeModelApi();
    renderApp('/threat-models/not-a-uuid/diagram');
    expect(await screen.findByText("This page doesn't exist.")).toBeTruthy();
  });
});
