import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_ID, PROJECT_ID_2, installFakeApi, json, project, renderApp } from '../test-utils.js';

// The project list (contracts/ui.md, "Project list"; spec FR-006, FR-009, FR-015, FR-016).
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProjectsPage', () => {
  it('lists projects in the API’s order with name links, descriptions and created dates', async () => {
    installFakeApi({
      'GET /api/v1/projects': () =>
        json(200, [project(), project({ id: PROJECT_ID_2, name: 'Identity', description: 'Login and SSO', created_at: '2026-11-15T10:00:00.000Z' })]),
    });
    renderApp('/projects');

    const links = await screen.findAllByRole('link', { name: /Payments|Identity/ });
    expect(links.map((l) => l.textContent)).toEqual(['Payments', 'Identity']);
    expect(links[0]?.getAttribute('href')).toBe(`/projects/${PROJECT_ID}`);
    expect(screen.getByText('Card payments')).toBeTruthy();
    expect(screen.getByText(new Date('2026-10-01T10:00:00.000Z').toLocaleDateString())).toBeTruthy();
  });

  it('shows an empty state with a New project button', async () => {
    installFakeApi({ 'GET /api/v1/projects': () => json(200, []) });
    renderApp('/projects');
    expect(await screen.findByText('No projects yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New project' })).toBeTruthy();
  });

  it('shows the server message and a Retry button when the list cannot be loaded', async () => {
    let fail = true;
    installFakeApi({
      'GET /api/v1/projects': () => (fail ? json(500, { error: 'Internal server error' }) : json(200, [project()])),
    });
    renderApp('/projects');
    expect(await screen.findByText('Internal server error')).toBeTruthy();

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: 'Payments' })).toBeTruthy();
  });

  describe('New project', () => {
    async function openForm() {
      await userEvent.click(await screen.findByRole('button', { name: 'New project' }));
    }

    it('has labelled Name and Description fields', async () => {
      installFakeApi({ 'GET /api/v1/projects': () => json(200, []) });
      renderApp('/projects');
      await openForm();
      expect(screen.getByLabelText('Name')).toBeTruthy();
      expect(screen.getByLabelText('Description')).toBeTruthy();
    });

    it.each([
      ['an empty name', '', /must not be empty/i],
      ['a name of 201 characters', 'x'.repeat(201), /at most 200 characters/i],
    ])('blocks %s in the browser, without sending a request', async (_label, name, message) => {
      const api = installFakeApi({ 'GET /api/v1/projects': () => json(200, []) });
      renderApp('/projects');
      await openForm();

      if (name) {
        await userEvent.click(screen.getByLabelText('Name'));
        await userEvent.paste(name);
      }
      await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
      expect(api.callsTo('POST', '/api/v1/projects')).toHaveLength(0);
    });

    it('shows a duplicate name on the Name field and keeps what was typed', async () => {
      installFakeApi({
        'GET /api/v1/projects': () => json(200, [project()]),
        'POST /api/v1/projects': () => json(409, { error: 'A project with this name already exists' }),
      });
      renderApp('/projects');
      await openForm();
      await userEvent.type(screen.getByLabelText('Name'), 'payments');
      await userEvent.type(screen.getByLabelText('Description'), 'second try');

      await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

      const message = await screen.findByText('A project with this name already exists');
      expect(message.id).toBe(screen.getByLabelText('Name').getAttribute('aria-describedby'));
      expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('payments');
      expect(screen.getByLabelText<HTMLTextAreaElement>('Description').value).toBe('second try');
    });

    it('is not optimistic: it shows Saving…, leaves the list alone, and refetches after the server confirms', async () => {
      let release: (response: Response) => void = () => undefined;
      let created = false;
      const api = installFakeApi({
        'GET /api/v1/projects': () => json(200, created ? [project(), project({ id: PROJECT_ID_2, name: 'Identity' })] : [project()]),
        'POST /api/v1/projects': () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      });
      renderApp('/projects');
      await openForm();
      await userEvent.type(screen.getByLabelText('Name'), 'Identity');

      await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

      const saving = await screen.findByRole('button', { name: 'Saving…' });
      expect(saving.hasAttribute('disabled')).toBe(true);
      expect(screen.queryByRole('link', { name: 'Identity' })).toBeNull();

      created = true;
      release(json(201, project({ id: PROJECT_ID_2, name: 'Identity' })));

      expect(await screen.findByRole('link', { name: 'Identity' })).toBeTruthy();
      expect(screen.queryByLabelText('Name')).toBeNull();
      expect(api.callsTo('POST', '/api/v1/projects')[0]?.body).toMatchObject({ name: 'Identity' });
    });

    it('sends the trimmed name and an empty description by default', async () => {
      const api = installFakeApi({
        'GET /api/v1/projects': () => json(200, []),
        'POST /api/v1/projects': () => json(201, project()),
      });
      renderApp('/projects');
      await openForm();
      await userEvent.type(screen.getByLabelText('Name'), '  Payments  ');
      await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

      await waitFor(() => expect(api.callsTo('POST', '/api/v1/projects')).toHaveLength(1));
      expect(api.callsTo('POST', '/api/v1/projects')[0]?.body).toEqual({ name: 'Payments', description: '' });
    });

    it('closes the form on Cancel without sending anything', async () => {
      const api = installFakeApi({ 'GET /api/v1/projects': () => json(200, []) });
      renderApp('/projects');
      await openForm();
      await userEvent.click(within(screen.getByRole('form', { name: 'New project' })).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByLabelText('Name')).toBeNull();
      expect(api.callsTo('POST', '/api/v1/projects')).toHaveLength(0);
    });
  });
});
