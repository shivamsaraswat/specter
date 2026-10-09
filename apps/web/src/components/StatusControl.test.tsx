import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useModelMitigations } from '../api/queries.js';
import { MODEL_ID, THREAT_ID, installFakeApi, json, mitigation, renderWithClient, threat } from '../test-utils.js';
import { StatusControl } from './StatusControl.js';

// The status control in a threat's row (contracts/web-ui.md §1; spec FR-003 to FR-006, FR-008).
afterEach(() => {
  vi.unstubAllGlobals();
});

const TITLE = 'Session token theft';
const MITIGATIONS_PATH = `/api/v1/threat-models/${MODEL_ID}/mitigations`;
const THREAT_PATH = `/api/v1/threats/${THREAT_ID}`;
const MITIGATED_REFUSED =
  'A threat can be set to mitigated only when at least one of its mitigations is implemented or verified';

const select = () => screen.getByRole<HTMLSelectElement>('combobox', { name: `Status of ${TITLE}` });

// Mounts the model's mitigation list alongside, as the table does, so a refetch of it can be seen.
function Harness({ threatRecord, mitigations, onOpen }: { threatRecord: unknown; mitigations: unknown[]; onOpen: () => void }) {
  useModelMitigations(MODEL_ID);
  return <StatusControl threat={threatRecord as never} mitigations={mitigations as never} threatModelId={MODEL_ID} onOpenMitigations={onOpen} />;
}

function setup(
  threatOverrides: Record<string, unknown> = {},
  mitigations: unknown[] = [],
  handlers: Parameters<typeof installFakeApi>[0] = {},
) {
  const onOpen = vi.fn();
  const api = installFakeApi({
    [`GET ${MITIGATIONS_PATH}`]: () => json(200, mitigations),
    ...handlers,
  });
  renderWithClient(<Harness threatRecord={threat(threatOverrides)} mitigations={mitigations} onOpen={onOpen} />);
  return { api, onOpen };
}

const patches = (api: ReturnType<typeof installFakeApi>) => api.callsTo('PATCH', THREAT_PATH);

describe('StatusControl', () => {
  it('is a select named for the threat, showing the server’s status, with the four statuses', () => {
    setup({ status: 'accepted', status_reason: 'Covered' });
    expect(select().value).toBe('accepted');
    expect([...select().options].map((o) => o.textContent)).toEqual(['open', 'mitigated', 'accepted', 'not applicable']);
  });

  describe('open', () => {
    it('is sent at once, with nothing else', async () => {
      const { api } = setup({ status: 'accepted', status_reason: 'Covered' }, [], {
        [`PATCH ${THREAT_PATH}`]: () => json(200, threat({ status: 'open' })),
      });
      await userEvent.selectOptions(select(), 'open');
      await waitFor(() => expect(patches(api)).toHaveLength(1));
      expect(patches(api)[0]?.body).toEqual({ status: 'open' });
    });
  });

  describe('mitigated', () => {
    it('is sent at once when a loaded mitigation is implemented', async () => {
      const { api } = setup({}, [mitigation({ status: 'implemented' })], {
        [`PATCH ${THREAT_PATH}`]: () => json(200, threat({ status: 'mitigated' })),
      });
      await userEvent.selectOptions(select(), 'mitigated');
      await waitFor(() => expect(patches(api)).toHaveLength(1));
      expect(patches(api)[0]?.body).toEqual({ status: 'mitigated' });
    });

    it('is sent at once when a loaded mitigation is verified', async () => {
      const { api } = setup({}, [mitigation({ status: 'proposed' }), mitigation({ id: '99999999-9999-4999-8999-999999999999', status: 'verified' })], {
        [`PATCH ${THREAT_PATH}`]: () => json(200, threat({ status: 'mitigated' })),
      });
      await userEvent.selectOptions(select(), 'mitigated');
      await waitFor(() => expect(patches(api)).toHaveLength(1));
    });

    it('sends nothing without one: it says what to do, opens the mitigations, and keeps the status', async () => {
      const { api, onOpen } = setup({}, [mitigation({ status: 'proposed' })]);
      await userEvent.selectOptions(select(), 'mitigated');
      expect((await screen.findByRole('alert')).textContent).toBe('Mark one of its mitigations implemented or verified first.');
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(patches(api)).toHaveLength(0);
      expect(select().value).toBe('open');
    });
  });

  describe('accepted and not applicable need a reason (FR-004)', () => {
    it('opens a focused reason editor for accepted, and sends nothing yet', async () => {
      const { api } = setup();
      await userEvent.selectOptions(select(), 'accepted');
      const reason = await screen.findByRole('textbox', { name: `Reason for accepting ${TITLE}` });
      expect(document.activeElement).toBe(reason);
      expect(patches(api)).toHaveLength(0);
      expect(select().value).toBe('open');
    });

    it('names the editor for not applicable differently', async () => {
      setup();
      await userEvent.selectOptions(select(), 'not_applicable');
      expect(await screen.findByRole('textbox', { name: `Reason it does not apply: ${TITLE}` })).toBeTruthy();
    });

    it('refuses a blank reason in the form, with no request', async () => {
      const { api } = setup();
      await userEvent.selectOptions(select(), 'accepted');
      await userEvent.type(await screen.findByRole('textbox', { name: /Reason for accepting/ }), '   ');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Give a reason')).toBeTruthy();
      expect(patches(api)).toHaveLength(0);
    });

    it('sends the status and the reason together, then closes the editor', async () => {
      const { api } = setup({}, [], {
        [`PATCH ${THREAT_PATH}`]: () => json(200, threat({ status: 'accepted', status_reason: 'Covered by WAF' })),
      });
      await userEvent.selectOptions(select(), 'accepted');
      await userEvent.type(await screen.findByRole('textbox', { name: /Reason for accepting/ }), 'Covered by WAF');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(patches(api)).toHaveLength(1));
      expect(patches(api)[0]?.body).toEqual({ status: 'accepted', status_reason: 'Covered by WAF' });
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    });

    it('starts from the stored reason when moving from accepted to not applicable (FR-005)', async () => {
      const { api } = setup({ status: 'accepted', status_reason: 'Accepted for now' }, [], {
        [`PATCH ${THREAT_PATH}`]: () => json(200, threat({ status: 'not_applicable', status_reason: 'Accepted for now' })),
      });
      await userEvent.selectOptions(select(), 'not_applicable');
      const reason = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: `Reason it does not apply: ${TITLE}` });
      expect(reason.value).toBe('Accepted for now');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(patches(api)).toHaveLength(1));
      expect(patches(api)[0]?.body).toEqual({ status: 'not_applicable', status_reason: 'Accepted for now' });
    });

    it('starts empty when moving from open', async () => {
      setup();
      await userEvent.selectOptions(select(), 'accepted');
      expect((await screen.findByRole<HTMLTextAreaElement>('textbox')).value).toBe('');
    });

    it('closes on Cancel without a request, and the select still shows the server’s status', async () => {
      const { api } = setup();
      await userEvent.selectOptions(select(), 'accepted');
      await screen.findByRole('textbox');
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(select().value).toBe('open');
      expect(patches(api)).toHaveLength(0);
    });
  });

  describe('editing a reason on its own', () => {
    it('offers it for an accepted threat, and sends the reason alone', async () => {
      const { api } = setup({ status: 'accepted', status_reason: 'Old reason' }, [], {
        [`PATCH ${THREAT_PATH}`]: () => json(200, threat({ status: 'accepted', status_reason: 'New reason' })),
      });
      await userEvent.click(screen.getByRole('button', { name: `Edit reason for ${TITLE}` }));
      const reason = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: `Reason for accepting ${TITLE}` });
      expect(reason.value).toBe('Old reason');
      await userEvent.clear(reason);
      await userEvent.type(reason, 'New reason');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(patches(api)).toHaveLength(1));
      expect(patches(api)[0]?.body).toEqual({ status_reason: 'New reason' });
    });

    it('is not offered for an open threat', () => {
      setup();
      expect(screen.queryByRole('button', { name: /Edit reason/ })).toBeNull();
    });
  });

  describe('when the server refuses', () => {
    it('shows its message, refetches the mitigations, and keeps the server’s status (409)', async () => {
      const { api } = setup({}, [mitigation({ status: 'implemented' })], {
        [`PATCH ${THREAT_PATH}`]: () => json(409, { error: MITIGATED_REFUSED }),
      });
      await waitFor(() => expect(api.callsTo('GET', MITIGATIONS_PATH)).toHaveLength(1));
      await userEvent.selectOptions(select(), 'mitigated');
      expect((await screen.findByRole('alert')).textContent).toBe(MITIGATED_REFUSED);
      await waitFor(() => expect(api.callsTo('GET', MITIGATIONS_PATH).length).toBeGreaterThan(1));
      expect(select().value).toBe('open');
    });
  });

  describe('what is missing for the status (FR-006)', () => {
    it('marks an accepted threat that has no reason', () => {
      setup({ status: 'accepted', status_reason: null });
      expect(screen.getByText('Needs a reason')).toBeTruthy();
    });

    it('marks a mitigated threat with no implemented or verified mitigation', () => {
      setup({ status: 'mitigated' }, [mitigation({ status: 'proposed' })]);
      expect(screen.getByText('No implemented mitigation')).toBeTruthy();
    });

    it('marks nothing when the status has what it needs', () => {
      setup({ status: 'accepted', status_reason: 'Covered' });
      expect(screen.queryByText('Needs a reason')).toBeNull();
      expect(screen.queryByText('No implemented mitigation')).toBeNull();
    });
  });

  it('shows the reason as text, never as markup (FR-024)', () => {
    setup({ status: 'accepted', status_reason: '<img src=x onerror=alert(1)>' });
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});
