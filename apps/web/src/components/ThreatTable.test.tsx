import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ELEMENT_ID,
  MITIGATION_ID_2,
  MODEL_ID,
  THREAT_ID,
  THREAT_ID_2,
  element,
  installFakeApi,
  json,
  mitigation,
  renderWithClient,
  threat,
} from '../test-utils.js';
import { ThreatTable } from './ThreatTable.js';

// The threat table (contracts/ui.md, "Threat model page"; spec FR-010, FR-012, FR-017).
afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(threats: unknown[], mitigations: unknown[] = [], elements: unknown[] = []) {
  renderWithClient(
    <ThreatTable threatModelId={MODEL_ID} threats={threats as never} mitigations={mitigations as never} elements={elements as never} />,
  );
}

describe('ThreatTable', () => {
  it('has the documented columns, in order', () => {
    setup([threat()]);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Title', 'Category', 'Likelihood', 'Impact', 'Risk', 'Status', 'Element', 'Mitigations', 'Actions']);
  });

  it('shows the risk the server derived, the status, and the element name or a dash', () => {
    setup(
      [threat({ element_id: ELEMENT_ID }), threat({ id: THREAT_ID_2, title: 'Model-level threat', risk: 'Low', element_id: null })],
      [],
      [element()],
    );
    const withElement = screen.getByText('Session token theft').closest('tr') as HTMLElement;
    expect(within(withElement).getByText('API gateway')).toBeTruthy();
    expect(within(withElement).getByText('Critical')).toBeTruthy();
    const modelLevel = screen.getByText('Model-level threat').closest('tr') as HTMLElement;
    expect(within(modelLevel).getByText('—')).toBeTruthy();
    expect(within(modelLevel).getByText('Low', { selector: 'td' })).toBeTruthy();
  });

  it('counts each threat’s mitigations from the one grouped list', () => {
    setup(
      [threat(), threat({ id: THREAT_ID_2, title: 'Other' })],
      [mitigation(), mitigation({ id: MITIGATION_ID_2 })],
    );
    const first = screen.getByText('Session token theft').closest('tr') as HTMLElement;
    const second = screen.getByText('Other').closest('tr') as HTMLElement;
    expect(within(first).getByRole('button', { name: '2 mitigations' })).toBeTruthy();
    expect(within(second).getByRole('button', { name: '0 mitigations' })).toBeTruthy();
  });

  it('renders mitigations only for an expanded row, and the toggle says whether it is open', async () => {
    setup([threat()], [mitigation()]);
    const toggle = screen.getByRole('button', { name: '1 mitigation' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Rotate refresh credentials')).toBeNull();

    await userEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Rotate refresh credentials')).toBeTruthy();
    await userEvent.click(toggle);
    expect(screen.queryByText('Rotate refresh credentials')).toBeNull();
  });

  it('renders a title and description as literal text, never as markup', () => {
    setup([threat({ title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>' })]);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('shows an empty state instead of a table when there are no threats', () => {
    setup([]);
    expect(screen.getByText('No threats yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  describe('deleting a threat', () => {
    it('names the threat and the mitigations that go with it', async () => {
      installFakeApi({});
      setup([threat()], [mitigation(), mitigation({ id: MITIGATION_ID_2 })]);
      await userEvent.click(screen.getByRole('button', { name: /Delete threat/ }));
      expect(screen.getByText('Delete threat "Session token theft"? Its 2 mitigation(s) will be deleted too.')).toBeTruthy();
    });

    it('does not mention mitigations when there are none', async () => {
      installFakeApi({});
      setup([threat()]);
      await userEvent.click(screen.getByRole('button', { name: /Delete threat/ }));
      expect(screen.getByText('Delete threat "Session token theft"?')).toBeTruthy();
    });

    it('sends nothing on Cancel, and a DELETE on confirm', async () => {
      const api = installFakeApi({ 'DELETE /api/v1/threats/:id': () => new Response(null, { status: 204 }) });
      setup([threat()]);

      await userEvent.click(screen.getByRole('button', { name: /Delete threat/ }));
      await userEvent.click(within(document.querySelector('dialog') as HTMLElement).getByRole('button', { name: 'Cancel' }));
      expect(api.callsTo('DELETE', /.*/)).toHaveLength(0);

      await userEvent.click(screen.getByRole('button', { name: /Delete threat/ }));
      await userEvent.click((document.querySelector('dialog') as HTMLElement).querySelector('button.danger') as HTMLElement);
      await waitFor(() => expect(api.callsTo('DELETE', `/api/v1/threats/${THREAT_ID}`)).toHaveLength(1));
    });
  });

  it('edits a threat in place, sending only what changed, and keeps its element link out of the request', async () => {
    const api = installFakeApi({ 'PATCH /api/v1/threats/:id': () => json(200, threat({ likelihood: 'Low', risk: 'Medium' })) });
    setup([threat({ element_id: ELEMENT_ID })], [], [element()]);

    await userEvent.click(screen.getByRole('button', { name: /Edit threat/ }));
    await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'Low');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.callsTo('PATCH', `/api/v1/threats/${THREAT_ID}`)).toHaveLength(1));
    expect(api.callsTo('PATCH', `/api/v1/threats/${THREAT_ID}`)[0]?.body).toEqual({ likelihood: 'Low' });
  });
});
