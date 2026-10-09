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
  describe('stale threats (FR-016, US3 scenario 7)', () => {
    it('marks a stale threat and gives the reason in place, under its title', () => {
      setup([
        threat({
          origin: 'rule',
          element_id: ELEMENT_ID,
          library_ref: 'df-x',
          stale: { reason: 'conditions_unmet', unmet: [{ fact: 'flag', flag: 'encrypted_in_transit', required: 'no', actual: 'yes' }] },
        }),
      ], [], [element()]);
      const cell = screen.getByText('Session token theft').closest('td') as HTMLElement;
      expect(within(cell).getByText('Stale')).toBeTruthy();
      expect(within(cell).getByText('The rule no longer applies: requires Encrypted in transit to be No; it is Yes.')).toBeTruthy();
    });

    it('shows no marker on a threat that is not stale', () => {
      setup([threat()]);
      expect(screen.queryByText('Stale')).toBeNull();
      expect(document.querySelector('.stale-reason')).toBeNull();
    });

    it('renders a retirement reason that looks like markup as text', () => {
      setup([
        threat({
          origin: 'rule',
          element_id: ELEMENT_ID,
          library_ref: 'p-old',
          stale: { reason: 'rule_retired', retired_on: '2026-11-02', retirement_reason: '<img src=x onerror=alert(1)>', replaced_by: [] },
        }),
      ], [], [element()]);
      expect(document.querySelector('.stale-reason img')).toBeNull();
      expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy();
    });
  });

  describe('where a threat came from (US4)', () => {
    it('says Manual for a threat written by hand', () => {
      setup([threat()]);
      const row = screen.getByText('Session token theft').closest('tr') as HTMLElement;
      expect(within(row).getByText('Manual')).toBeTruthy();
      expect(row.querySelector('code')).toBeNull();
    });

    it('says Rule, and shows the rule id as code, for a generated threat', () => {
      setup([threat({ origin: 'rule', element_id: ELEMENT_ID, library_ref: 'df-disclosure-plaintext-crossing' })], [], [element()]);
      const row = screen.getByText('Session token theft').closest('tr') as HTMLElement;
      expect(within(row).getByText('Rule')).toBeTruthy();
      expect(row.querySelector('code')?.textContent).toBe('df-disclosure-plaintext-crossing');
    });

    it('still names an origin it does not know, so the column never hides one', () => {
      setup([threat({ origin: 'ai' })]);
      expect(screen.getByText('ai')).toBeTruthy();
    });

    it('shows a rule id that looks like markup as text', () => {
      setup([threat({ origin: 'rule', element_id: ELEMENT_ID, library_ref: '<b>x</b>' })], [], [element()]);
      expect(document.querySelector('code b')).toBeNull();
      expect(document.querySelector('code')?.textContent).toBe('<b>x</b>');
    });
  });

  it('has the documented columns, in order', () => {
    setup([threat()]);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Title', 'Category', 'Likelihood', 'Impact', 'Risk', 'Status', 'Element', 'Source', 'Mitigations', 'Actions']);
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

  describe('the status control (FR-008)', () => {
    it('puts a status control, named for its threat, in each row', () => {
      setup([threat({ status: 'accepted', status_reason: 'Covered' }), threat({ id: THREAT_ID_2, title: 'Other' })]);
      const first = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Status of Session token theft' });
      const second = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Status of Other' });
      expect([first.value, second.value]).toEqual(['accepted', 'open']);
    });

    it('shows the reason as text under the status, and marks a decision with no reason', () => {
      setup([
        threat({ status: 'not_applicable', status_reason: 'Out of scope' }),
        threat({ id: THREAT_ID_2, title: 'Older decision', status: 'accepted', status_reason: null }),
      ]);
      const reasoned = screen.getByText('Session token theft').closest('tr') as HTMLElement;
      expect(within(reasoned).getByText('Out of scope')).toBeTruthy();
      const older = screen.getByText('Older decision').closest('tr') as HTMLElement;
      expect(within(older).getByText('Needs a reason')).toBeTruthy();
    });

    it('passes the row’s own mitigations to the control', () => {
      setup([threat({ status: 'mitigated' })], [mitigation({ status: 'implemented' })]);
      expect(screen.queryByText('No implemented mitigation')).toBeNull();
    });
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

    const COMES_BACK =
      'Generating threats again will create it again while its rule applies. To dismiss it for good, set its status to Not applicable, with a reason, instead.';

    it('warns that a generated threat comes back, and points to Not applicable (FR-016a)', async () => {
      installFakeApi({});
      setup([threat({ origin: 'rule', element_id: ELEMENT_ID, library_ref: 'p-spoofing-no-auth' })], [], [element()]);
      await userEvent.click(screen.getByRole('button', { name: /Delete threat/ }));
      expect(screen.getByText(/Delete threat "Session token theft"\?/).textContent).toContain(COMES_BACK);
    });

    it('does not say so for a manual threat', async () => {
      installFakeApi({});
      setup([threat()]);
      await userEvent.click(screen.getByRole('button', { name: /Delete threat/ }));
      expect(document.querySelector('dialog')?.textContent).not.toContain('Generating threats again');
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
