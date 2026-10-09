import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors.js';
import { ELEMENT_ID, MODEL_ID, element, mitigation, renderWithClient, threat } from '../test-utils.js';
import { ThreatForm } from './ThreatForm.js';

// The threat form (contracts/ui.md, "Threat form"; spec FR-011, FR-012, FR-014, FR-015).
function setup(props: Partial<React.ComponentProps<typeof ThreatForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  renderWithClient(<ThreatForm threatModelId={MODEL_ID} onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  return { onSubmit, onCancel };
}

const optionsOf = (label: string): string[] =>
  [...screen.getByLabelText<HTMLSelectElement>(label).options].map((o) => o.textContent ?? '');

async function fillRequired(title = 'Session token theft') {
  await userEvent.type(screen.getByLabelText('Title'), title);
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'Spoofing');
  await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'High');
  await userEvent.selectOptions(screen.getByLabelText('Impact'), 'High');
}

const DB_ID = '88888888-1111-4111-8111-111111111111';
const FLOW_ID = '88888888-2222-4222-8222-222222222222';
const MODEL_ELEMENTS = [
  element({ id: DB_ID, type: 'data_store', name: 'Orders DB' }),
  element({ id: FLOW_ID, type: 'data_flow', name: 'Writes order' }),
  element(), // the process "API gateway"
];

describe('ThreatForm, linking to an element (spec FR-018)', () => {
  it('offers none first, then every element of the model grouped by type, each group by name', () => {
    setup({ elements: MODEL_ELEMENTS as never });
    const select = screen.getByLabelText<HTMLSelectElement>('Element');
    expect(select.options[0]?.textContent).toBe('None (model-level)');
    expect(select.value).toBe('');
    const groups = [...select.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.textContent)]);
    expect(groups).toEqual([
      ['Process', ['API gateway']],
      ['Data store', ['Orders DB']],
      ['Data flow', ['Writes order']],
    ]);
  });

  it('sends the chosen element with a new threat, and null when none is chosen', async () => {
    const { onSubmit } = setup({ elements: MODEL_ELEMENTS as never });
    await fillRequired();
    await userEvent.selectOptions(screen.getByLabelText('Element'), DB_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ element_id: DB_ID, origin: 'manual' });
  });

  it('sends null for a model-level threat', async () => {
    const { onSubmit } = setup({ elements: MODEL_ELEMENTS as never });
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ element_id: null });
  });

  it('starts on the element it is opened for', async () => {
    const { onSubmit } = setup({ elements: MODEL_ELEMENTS as never, presetElementId: ELEMENT_ID });
    expect(screen.getByLabelText<HTMLSelectElement>('Element').value).toBe(ELEMENT_ID);
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ element_id: ELEMENT_ID });
  });

  it('lets a manual threat be moved to another element, sending the element alone', async () => {
    const { onSubmit } = setup({ elements: MODEL_ELEMENTS as never, initial: threat({ element_id: ELEMENT_ID }) as never });
    expect(screen.getByLabelText<HTMLSelectElement>('Element').value).toBe(ELEMENT_ID);
    await userEvent.selectOptions(screen.getByLabelText('Element'), DB_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ element_id: DB_ID });
  });

  it('lets a manual threat be unlinked, sending null', async () => {
    const { onSubmit } = setup({ elements: MODEL_ELEMENTS as never, initial: threat({ element_id: ELEMENT_ID }) as never });
    await userEvent.selectOptions(screen.getByLabelText('Element'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ element_id: null });
  });

  // A generated threat's element is part of what it is (Milestone 3 FR-009): shown, never offered, never sent.
  it('shows a rule-generated threat\'s element as text, with nothing to choose, and never sends it', async () => {
    const { onSubmit } = setup({
      elements: MODEL_ELEMENTS as never,
      initial: threat({ origin: 'rule', element_id: ELEMENT_ID, library_ref: 'p-spoofing-no-auth' }) as never,
    });
    expect(screen.queryByLabelText('Element')).toBeNull();
    expect(screen.getByText('API gateway', { selector: 'span' })).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'Low');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ likelihood: 'Low' });
  });

  it('shows the element name as plain text, never as markup', () => {
    const { container } = renderWithClient(
      <ThreatForm threatModelId={MODEL_ID} elements={[element({ name: '<img src=x onerror=alert(1)>' })] as never} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
});

describe('ThreatForm, creating', () => {
  it('offers the six STRIDE categories, three likelihoods and impacts, and the statuses a new threat can have, defaulting to open', () => {
    setup();
    expect(optionsOf('Category').filter((o) => o !== 'Select…')).toEqual([
      'Spoofing',
      'Tampering',
      'Repudiation',
      'Information Disclosure',
      'Denial of Service',
      'Elevation of Privilege',
    ]);
    expect(optionsOf('Likelihood').filter((o) => o !== 'Select…')).toEqual(['Low', 'Medium', 'High']);
    expect(optionsOf('Impact').filter((o) => o !== 'Select…')).toEqual(['Low', 'Medium', 'High']);
    // A new threat has no mitigations yet, so it cannot be mitigated (spec FR-003).
    expect(optionsOf('Status')).toEqual(['open', 'accepted', 'not applicable']);
    expect(screen.getByLabelText<HTMLSelectElement>('Status').value).toBe('open');
  });

  it('asks for a reason only while the status is accepted or not applicable, and requires it there (FR-004)', async () => {
    const { onSubmit } = setup();
    expect(screen.queryByLabelText('Reason')).toBeNull();
    await fillRequired();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'accepted');
    expect(screen.getByLabelText('Reason')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));
    expect(await screen.findByText(/is required when status is accepted or not_applicable/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Reason'), 'Covered by the WAF');
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ status: 'accepted', status_reason: 'Covered by the WAF' });
  });

  it('never sends a reason typed for a status the user then moved away from (FR-005)', async () => {
    const { onSubmit } = setup();
    await fillRequired();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'not_applicable');
    await userEvent.type(screen.getByLabelText('Reason'), 'Typed, then abandoned');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'open');
    expect(screen.queryByLabelText('Reason')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ status: 'open', status_reason: null });
  });

  it('shows origin as "manual" and offers no way to change it', () => {
    setup();
    expect(screen.getByText('manual')).toBeTruthy();
    expect(screen.queryByLabelText('Origin')).toBeNull();
  });

  it('sends a model-level threat with origin "manual", exactly as validated', async () => {
    const { onSubmit } = setup();
    await fillRequired();
    await userEvent.type(screen.getByLabelText('Description'), 'A stolen token is replayed');

    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      threat_model_id: MODEL_ID,
      element_id: null,
      category: 'Spoofing',
      title: 'Session token theft',
      description: 'A stolen token is replayed',
      likelihood: 'High',
      impact: 'High',
      status: 'open',
      origin: 'manual',
      library_ref: null,
      status_reason: null,
    });
  });

  it('blocks a missing title or a choice not made, and a 201-character title, with no request', async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));
    expect(await screen.findByText(/Must not be empty/)).toBeTruthy();
    expect(screen.getByText('Choose a category')).toBeTruthy();
    expect(screen.getByText('Choose a likelihood')).toBeTruthy();
    expect(screen.getByText('Choose an impact')).toBeTruthy();

    await userEvent.click(screen.getByLabelText('Title'));
    await userEvent.paste('x'.repeat(201));
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Spoofing');
    await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'Low');
    await userEvent.selectOptions(screen.getByLabelText('Impact'), 'Low');
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));

    expect(await screen.findByText(/at most 200 characters/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server rejection next to its field and keeps everything that was typed', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'title: must be at most 200 characters'));
    setup({ onSubmit });
    await fillRequired('Short title');
    await userEvent.type(screen.getByLabelText('Description'), 'kept text');

    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));

    const message = await screen.findByText('must be at most 200 characters');
    expect(message.id).toBe(screen.getByLabelText('Title').getAttribute('aria-describedby'));
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('Short title');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Description').value).toBe('kept text');
    expect(screen.getByLabelText<HTMLSelectElement>('Category').value).toBe('Spoofing');
  });

  it('calls onCancel on Cancel', async () => {
    const { onCancel, onSubmit } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('ThreatForm, editing', () => {
  const initial = threat({ element_id: element().id, likelihood: 'High', impact: 'High', risk: 'Critical' });

  it('prefills every field, and shows risk and origin as read-only text', () => {
    setup({ initial: initial as never });
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('Session token theft');
    expect(screen.getByLabelText<HTMLSelectElement>('Category').value).toBe('Spoofing');
    expect(screen.getByLabelText<HTMLSelectElement>('Likelihood').value).toBe('High');
    expect(screen.getByText('Critical')).toBeTruthy();
    expect(screen.getByText('manual')).toBeTruthy();
    expect(screen.queryByLabelText('Risk')).toBeNull();
    expect(screen.queryByLabelText('Origin')).toBeNull();
  });

  it('sends only the changed fields, and never origin, element_id, risk or the threat model', async () => {
    const { onSubmit } = setup({ initial: initial as never });
    await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'Low');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const sent = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toEqual({ likelihood: 'Low' });
    for (const forbidden of ['origin', 'element_id', 'risk', 'threat_model_id']) expect(sent).not.toHaveProperty(forbidden);
  });

  it('allows any status at any time, including moving backwards', async () => {
    const { onSubmit } = setup({ initial: threat({ status: 'accepted' }) as never });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'open');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ status: 'open' });
  });

  it('offers all four statuses when editing', () => {
    setup({ initial: initial as never });
    expect(optionsOf('Status')).toEqual(['open', 'mitigated', 'accepted', 'not applicable']);
  });

  describe('the status and its reason (FR-003 to FR-005)', () => {
    it('prefills the stored reason of an accepted threat, and sends it with a change to not applicable', async () => {
      const { onSubmit } = setup({ initial: threat({ status: 'accepted', status_reason: 'Accepted for now' }) as never });
      expect(screen.getByLabelText<HTMLTextAreaElement>('Reason').value).toBe('Accepted for now');
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'not_applicable');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ status: 'not_applicable', status_reason: 'Accepted for now' });
    });

    it('sends a changed reason on its own when the status stays', async () => {
      const { onSubmit } = setup({ initial: threat({ status: 'accepted', status_reason: 'Old' }) as never });
      await userEvent.clear(screen.getByLabelText('Reason'));
      await userEvent.type(screen.getByLabelText('Reason'), 'New');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ status_reason: 'New' });
    });

    it('sends the status and a reason together when moving to accepted', async () => {
      const { onSubmit } = setup({ initial: threat() as never });
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'accepted');
      await userEvent.type(screen.getByLabelText('Reason'), 'Covered');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ status: 'accepted', status_reason: 'Covered' });
    });

    it('never sends a reason with open', async () => {
      const { onSubmit } = setup({ initial: threat({ status: 'accepted', status_reason: 'Old' }) as never });
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'open');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ status: 'open' });
    });

    it('refuses mitigated while no loaded mitigation is implemented or verified, and sends nothing', async () => {
      const { onSubmit } = setup({ initial: threat() as never, mitigations: [mitigation({ status: 'proposed' })] as never });
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'mitigated');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Mark one of its mitigations implemented or verified first.')).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('sends mitigated once a loaded mitigation is implemented', async () => {
      const { onSubmit } = setup({ initial: threat() as never, mitigations: [mitigation({ status: 'implemented' })] as never });
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'mitigated');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ status: 'mitigated' });
    });

    it('does not check a threat that is already mitigated when something else changes', async () => {
      const { onSubmit } = setup({ initial: threat({ status: 'mitigated' }) as never, mitigations: [] as never });
      await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'Low');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ likelihood: 'Low' });
    });
  });

  it('sends nothing, and closes, when nothing changed', async () => {
    const { onSubmit, onCancel } = setup({ initial: initial as never });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
