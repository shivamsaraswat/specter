import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL_ID, MODEL_ID_2, PROJECT_ID, installFakeApi, json, project, renderApp, threatModel } from '../test-utils.js';

// A project and its threat models (contracts/ui.md, "Project page"; spec FR-006, FR-007, FR-008).
afterEach(() => {
  vi.unstubAllGlobals();
});

const base = {
  [`GET /api/v1/projects/:id`]: () => json(200, project()),
  [`GET /api/v1/projects/:id/threat-models`]: () => json(200, [threatModel()]),
};

describe('ProjectPage details', () => {
  it('shows the project’s name and description', async () => {
    installFakeApi(base);
    renderApp(`/projects/${PROJECT_ID}`);
    expect(await screen.findByRole('heading', { name: 'Payments' })).toBeTruthy();
    expect(screen.getByText('Card payments')).toBeTruthy();
  });

  it('sends only the changed fields when editing', async () => {
    const api = installFakeApi({
      ...base,
      'PATCH /api/v1/projects/:id': () => json(200, project({ name: 'Payments platform' })),
    });
    renderApp(`/projects/${PROJECT_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Payments platform');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.callsTo('PATCH', `/api/v1/projects/${PROJECT_ID}`)).toHaveLength(1));
    expect(api.callsTo('PATCH', `/api/v1/projects/${PROJECT_ID}`)[0]?.body).toEqual({ name: 'Payments platform' });
  });

  it('sends nothing when nothing changed', async () => {
    const api = installFakeApi(base);
    renderApp(`/projects/${PROJECT_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.callsTo('PATCH', /.*/)).toHaveLength(0);
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('shows a rejected rename on the field, with what was typed kept', async () => {
    installFakeApi({
      ...base,
      'PATCH /api/v1/projects/:id': () => json(409, { error: 'A project with this name already exists' }),
    });
    renderApp(`/projects/${PROJECT_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText<HTMLInputElement>('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Identity');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('A project with this name already exists')).toBeTruthy();
    expect(name.value).toBe('Identity');
  });

  it('asks before deleting, naming the project and what goes with it; Cancel sends nothing', async () => {
    const api = installFakeApi(base);
    renderApp(`/projects/${PROJECT_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(
      screen.getByText('Delete project "Payments"? This permanently deletes its threat models and everything in them.'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(api.callsTo('DELETE', /.*/)).toHaveLength(0);
    expect(screen.queryByText(/permanently deletes its threat models/)).toBeNull();
  });

  it('deletes on confirm and returns to the project list', async () => {
    const api = installFakeApi({
      ...base,
      'DELETE /api/v1/projects/:id': () => new Response(null, { status: 204 }),
      'GET /api/v1/projects': () => json(200, []),
    });
    renderApp(`/projects/${PROJECT_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = document.querySelector('dialog') as HTMLElement;
    await userEvent.click(dialog.querySelector('button.danger') as HTMLElement);

    expect(await screen.findByText('No projects yet.')).toBeTruthy();
    expect(api.callsTo('DELETE', `/api/v1/projects/${PROJECT_ID}`)).toHaveLength(1);
  });

  it('shows the not-found page for a project that does not exist, and none for a malformed id', async () => {
    const api = installFakeApi({ 'GET /api/v1/projects/:id': () => json(404, { error: 'Not found' }) });
    renderApp(`/projects/${PROJECT_ID}`);
    expect(await screen.findByText("This page doesn't exist.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the project list' }).getAttribute('href')).toBe('/projects');

    api.fetchMock.mockClear();
  });

  it('shows the not-found page, with no request, for an id that is not a UUID', async () => {
    const api = installFakeApi({});
    renderApp('/projects/not-a-uuid');
    expect(await screen.findByText("This page doesn't exist.")).toBeTruthy();
    expect(api.calls.filter((c) => c.path.startsWith('/api/v1'))).toHaveLength(0);
  });
});

describe('ProjectPage threat models', () => {
  it('lists them with a name link, methodology and status', async () => {
    installFakeApi({
      ...base,
      'GET /api/v1/projects/:id/threat-models': () =>
        json(200, [threatModel(), threatModel({ id: MODEL_ID_2, name: 'Refunds', status: 'in_review' })]),
    });
    renderApp(`/projects/${PROJECT_ID}`);

    const link = await screen.findByRole('link', { name: 'Checkout v2' });
    expect(link.getAttribute('href')).toBe(`/threat-models/${MODEL_ID}`);
    const row = link.closest('tr') as HTMLElement;
    expect(row.textContent).toContain('STRIDE');
    expect(row.textContent).toContain('draft');
    expect((screen.getByRole('link', { name: 'Refunds' }).closest('tr') as HTMLElement).textContent).toContain('in review');
  });

  it('shows an empty state', async () => {
    installFakeApi({ ...base, 'GET /api/v1/projects/:id/threat-models': () => json(200, []) });
    renderApp(`/projects/${PROJECT_ID}`);
    expect(await screen.findByText('No threat models yet.')).toBeTruthy();
  });

  it('creates one with a name only, in this project', async () => {
    const api = installFakeApi({
      ...base,
      'POST /api/v1/threat-models': () => json(201, threatModel()),
    });
    renderApp(`/projects/${PROJECT_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'New threat model' }));
    expect(screen.queryByLabelText('Description')).toBeNull();
    await userEvent.type(screen.getByLabelText('Name'), 'Checkout v2');

    await userEvent.click(screen.getByRole('button', { name: 'Create threat model' }));

    await waitFor(() => expect(api.callsTo('POST', '/api/v1/threat-models')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/v1/threat-models')[0]?.body).toMatchObject({ project_id: PROJECT_ID, name: 'Checkout v2' });
  });

  it('shows a duplicate name on the Name field', async () => {
    installFakeApi({
      ...base,
      'POST /api/v1/threat-models': () =>
        json(409, { error: 'A threat model with this name already exists in this project' }),
    });
    renderApp(`/projects/${PROJECT_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'New threat model' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Checkout v2');
    await userEvent.click(screen.getByRole('button', { name: 'Create threat model' }));

    expect(await screen.findByText('A threat model with this name already exists in this project')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Checkout v2');
  });
});
