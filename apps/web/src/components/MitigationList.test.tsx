import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MITIGATION_ID, MITIGATION_ID_2, MODEL_ID, THREAT_ID, installFakeApi, json, mitigation, renderWithClient } from '../test-utils.js';
import { MitigationList } from './MitigationList.js';

// Mitigations on a threat (contracts/ui.md, "Mitigations"; spec FR-013, FR-014, FR-008).
afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(mitigations = [mitigation()]) {
  renderWithClient(<MitigationList threatId={THREAT_ID} threatModelId={MODEL_ID} mitigations={mitigations as never} />);
}

describe('MitigationList', () => {
  it('shows each mitigation’s description, status and ticket, with the ticket as a safe link', () => {
    setup([
      mitigation({ status: 'implemented', external_ref: 'https://tracker.example/SEC-1' }),
      mitigation({ id: MITIGATION_ID_2, description: 'Add rate limiting', external_ref: null }),
    ]);
    expect(screen.getByText('Rotate refresh credentials')).toBeTruthy();
    expect(screen.getByText('implemented')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'https://tracker.example/SEC-1' }).getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('Add rate limiting')).toBeTruthy();
  });

  it('shows an empty state, next to the Add mitigation button, when the threat has none', () => {
    setup([]);
    expect(screen.getByText('No mitigations yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add mitigation' })).toBeTruthy();
  });

  it('does not show the empty state when there are mitigations', () => {
    setup();
    expect(screen.queryByText('No mitigations yet.')).toBeNull();
  });

  it('renders mitigation text as text, never as markup', () => {
    setup([mitigation({ description: '<img src=x onerror=alert(1)>' })]);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('adds one with a description, a status defaulting to proposed, and an optional ticket', async () => {
    const api = installFakeApi({ 'POST /api/v1/mitigations': () => json(201, mitigation()) });
    setup([]);
    await userEvent.click(screen.getByRole('button', { name: 'Add mitigation' }));
    expect([...screen.getByLabelText<HTMLSelectElement>('Status').options].map((o) => o.textContent)).toEqual([
      'proposed',
      'implemented',
      'verified',
    ]);
    expect(screen.getByLabelText<HTMLSelectElement>('Status').value).toBe('proposed');
    await userEvent.type(screen.getByLabelText('Description'), 'Rotate refresh credentials');
    await userEvent.type(screen.getByLabelText('Ticket URL'), 'https://tracker.example/SEC-1');

    await userEvent.click(screen.getByRole('button', { name: 'Save mitigation' }));

    await waitFor(() => expect(api.callsTo('POST', '/api/v1/mitigations')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/v1/mitigations')[0]?.body).toEqual({
      threat_id: THREAT_ID,
      description: 'Rotate refresh credentials',
      status: 'proposed',
      external_ref: 'https://tracker.example/SEC-1',
    });
  });

  it('sends a blank ticket as null', async () => {
    const api = installFakeApi({ 'POST /api/v1/mitigations': () => json(201, mitigation()) });
    setup([]);
    await userEvent.click(screen.getByRole('button', { name: 'Add mitigation' }));
    await userEvent.type(screen.getByLabelText('Description'), 'Do the thing');
    await userEvent.click(screen.getByRole('button', { name: 'Save mitigation' }));
    await waitFor(() => expect(api.callsTo('POST', '/api/v1/mitigations')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/v1/mitigations')[0]?.body).toMatchObject({ external_ref: null });
  });

  it.each([
    ['an empty description', 'Description', '', /must not be empty/i],
    ['a description of 10,001 characters', 'Description', 'd'.repeat(10_001), /at most 10000 characters/i],
  ])('blocks %s in the browser, without a request', async (_label, field, value, message) => {
    const api = installFakeApi({});
    setup([]);
    await userEvent.click(screen.getByRole('button', { name: 'Add mitigation' }));
    if (value) {
      await userEvent.click(screen.getByLabelText(field));
      await userEvent.paste(value);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Save mitigation' }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(api.callsTo('POST', /.*/)).toHaveLength(0);
  });

  it('blocks a ticket URL that is not http(s), and shows a server rejection of one on the field', async () => {
    installFakeApi({ 'POST /api/v1/mitigations': () => json(400, { error: 'external_ref: Invalid URL' }) });
    setup([]);
    await userEvent.click(screen.getByRole('button', { name: 'Add mitigation' }));
    await userEvent.type(screen.getByLabelText('Description'), 'x');
    await userEvent.type(screen.getByLabelText('Ticket URL'), 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Save mitigation' }));

    expect(await screen.findByText(/invalid url/i)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Ticket URL').value).toBe('javascript:alert(1)');
  });

  it('edits a mitigation, sending only the changed fields', async () => {
    const api = installFakeApi({ 'PATCH /api/v1/mitigations/:id': () => json(200, mitigation({ status: 'implemented' })) });
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'implemented');

    await userEvent.click(screen.getByRole('button', { name: 'Save mitigation' }));

    await waitFor(() => expect(api.callsTo('PATCH', `/api/v1/mitigations/${MITIGATION_ID}`)).toHaveLength(1));
    expect(api.callsTo('PATCH', `/api/v1/mitigations/${MITIGATION_ID}`)[0]?.body).toEqual({ status: 'implemented' });
  });

  it('asks "Delete this mitigation?" and deletes only on confirm', async () => {
    const api = installFakeApi({ 'DELETE /api/v1/mitigations/:id': () => new Response(null, { status: 204 }) });
    setup();

    await userEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByText('Delete this mitigation?')).toBeTruthy();
    await userEvent.click(within(document.querySelector('dialog') as HTMLElement).getByRole('button', { name: 'Cancel' }));
    expect(api.callsTo('DELETE', /.*/)).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /Delete/ }));
    await userEvent.click((document.querySelector('dialog') as HTMLElement).querySelector('button.danger') as HTMLElement);
    await waitFor(() => expect(api.callsTo('DELETE', `/api/v1/mitigations/${MITIGATION_ID}`)).toHaveLength(1));
  });
});
