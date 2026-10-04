import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ELEMENT_ID,
  MODEL_ID,
  THREAT_ID,
  element,
  installFakeApi,
  json,
  mitigation,
  project,
  renderApp,
  threat,
  threatModel,
} from '../test-utils.js';

// The threats section of the threat model page, end to end through the app's routes (spec FR-010 to
// FR-014, US2 scenarios).
afterEach(() => {
  vi.unstubAllGlobals();
});

function server(overrides: Record<string, () => Response | Promise<Response>> = {}) {
  return installFakeApi({
    'GET /api/v1/threat-models/:id': () => json(200, threatModel()),
    'GET /api/v1/projects/:id': () => json(200, project()),
    'GET /api/v1/threat-models/:id/elements': () => json(200, [element()]),
    'GET /api/v1/threat-models/:id/threats': () => json(200, [threat({ element_id: ELEMENT_ID })]),
    'GET /api/v1/threat-models/:id/mitigations': () => json(200, [mitigation()]),
    ...overrides,
  });
}

describe('the threat model page’s threats', () => {
  it('loads the model, its project, elements, threats and mitigations in one read each', async () => {
    const api = server();
    renderApp(`/threat-models/${MODEL_ID}`);
    expect(await screen.findByText('Session token theft')).toBeTruthy();

    // The project is read once the model has loaded, so it can arrive after the table does.
    const expected = [
      `/api/v1/projects/${threatModel().project_id}`,
      `/api/v1/threat-models/${MODEL_ID}`,
      `/api/v1/threat-models/${MODEL_ID}/elements`,
      `/api/v1/threat-models/${MODEL_ID}/mitigations`,
      `/api/v1/threat-models/${MODEL_ID}/threats`,
    ].sort();
    await waitFor(() => {
      const reads = api.calls.filter((c) => c.method === 'GET' && c.path.startsWith('/api/v1')).map((c) => c.path);
      expect(reads.sort()).toEqual(expected);
    });
    expect(screen.getByText('API gateway')).toBeTruthy();
  });

  it('shows an empty state with an Add threat button', async () => {
    server({ 'GET /api/v1/threat-models/:id/threats': () => json(200, []) });
    renderApp(`/threat-models/${MODEL_ID}`);
    expect(await screen.findByText('No threats yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add threat' })).toBeTruthy();
  });

  it('adds a threat, shows it with the server’s derived risk only after the server confirms, and closes the form', async () => {
    let created = false;
    const api = server({
      'GET /api/v1/threat-models/:id/threats': () => json(200, created ? [threat({ risk: 'Critical' })] : []),
      'POST /api/v1/threats': () => {
        created = true;
        return json(201, threat());
      },
    });
    renderApp(`/threat-models/${MODEL_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Add threat' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Session token theft');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Spoofing');
    await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'High');
    await userEvent.selectOptions(screen.getByLabelText('Impact'), 'High');
    await userEvent.click(within(screen.getByRole('form', { name: 'Add threat' })).getByRole('button', { name: 'Add threat' }));

    const row = (await screen.findByText('Session token theft')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Critical')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Add threat' })).toBeNull();
    expect(api.callsTo('POST', '/api/v1/threats')[0]?.body).toMatchObject({
      threat_model_id: MODEL_ID,
      element_id: null,
      origin: 'manual',
    });
  });

  it('shows a rejected threat in the form, and nothing in the table', async () => {
    server({
      'GET /api/v1/threat-models/:id/threats': () => json(200, []),
      'POST /api/v1/threats': () => json(400, { error: 'title: must be at most 200 characters' }),
    });
    renderApp(`/threat-models/${MODEL_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Add threat' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Looks fine to the browser');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Spoofing');
    await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'Low');
    await userEvent.selectOptions(screen.getByLabelText('Impact'), 'Low');
    await userEvent.click(within(screen.getByRole('form', { name: 'Add threat' })).getByRole('button', { name: 'Add threat' }));

    expect(await screen.findByText('must be at most 200 characters')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('Looks fine to the browser');
    expect(screen.getByText('No threats yet.')).toBeTruthy();
  });

  it('adds a mitigation to an expanded threat, and refetches the model’s mitigations', async () => {
    let added = false;
    const api = server({
      'GET /api/v1/threat-models/:id/mitigations': () =>
        json(200, added ? [mitigation(), mitigation({ id: '99999999-9999-4999-8999-999999999999', description: 'Add rate limiting' })] : [mitigation()]),
      'POST /api/v1/mitigations': () => {
        added = true;
        return json(201, mitigation({ description: 'Add rate limiting' }));
      },
    });
    renderApp(`/threat-models/${MODEL_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: '1 mitigation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add mitigation' }));
    await userEvent.type(screen.getByLabelText('Description'), 'Add rate limiting');
    await userEvent.click(screen.getByRole('button', { name: 'Save mitigation' }));

    expect(await screen.findByText('Add rate limiting')).toBeTruthy();
    expect(screen.getByRole('button', { name: '2 mitigations' }).getAttribute('aria-expanded')).toBe('true');
    expect(api.callsTo('POST', '/api/v1/mitigations')[0]?.body).toMatchObject({ threat_id: THREAT_ID });
  });

  it('keeps every field of an open Edit form tied to its own label when the Add form is open too', async () => {
    server();
    renderApp(`/threat-models/${MODEL_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Add threat' }));
    await userEvent.click(screen.getByRole('button', { name: /Edit threat/ }));

    const add = screen.getByRole('form', { name: 'Add threat' });
    const edit = screen.getByRole('form', { name: 'Edit threat' });
    // A label finds its control through the id, so a duplicated id would send the Edit form's labels
    // to the Add form's controls, which are outside this form.
    for (const label of ['Title', 'Category', 'Likelihood', 'Impact', 'Status', 'Description']) {
      expect(within(edit).getByLabelText(label), label).toBeTruthy();
      expect(within(add).getByLabelText(label), label).toBeTruthy();
    }
    // And every id in the page is unique.
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);

    // Typing in the Edit form's Title changes the Edit form's input, not the Add form's.
    const editTitle = within(edit).getByLabelText<HTMLInputElement>('Title');
    await userEvent.clear(editTitle);
    await userEvent.type(editTitle, 'Changed');
    expect(within(add).getByLabelText<HTMLInputElement>('Title').value).toBe('');
    expect(editTitle.value).toBe('Changed');
  });

  it('shows the server’s message and Retry when the threats cannot be loaded', async () => {
    let fail = true;
    server({
      'GET /api/v1/threat-models/:id/threats': () => (fail ? json(500, { error: 'Internal server error' }) : json(200, [threat()])),
    });
    renderApp(`/threat-models/${MODEL_ID}`);
    expect(await screen.findByText('Internal server error')).toBeTruthy();

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Session token theft')).toBeTruthy();
  });

  it('shows the server’s state, with a message, when deleting a threat that is already gone', async () => {
    let gone = false;
    server({
      'GET /api/v1/threat-models/:id/threats': () => json(200, gone ? [] : [threat()]),
      'DELETE /api/v1/threats/:id': () => {
        gone = true;
        return json(404, { error: 'Not found' });
      },
    });
    renderApp(`/threat-models/${MODEL_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: /Delete threat/ }));
    await userEvent.click((document.querySelector('dialog') as HTMLElement).querySelector('button.danger') as HTMLElement);

    await waitFor(() => expect(screen.getByText('No threats yet.')).toBeTruthy());
  });
});
