import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors.js';
import { MODEL_ID, element, renderWithClient, threat } from '../test-utils.js';
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

describe('ThreatForm, creating', () => {
  it('offers the six STRIDE categories, three likelihoods and impacts, and four statuses defaulting to open', () => {
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
    expect(optionsOf('Status')).toEqual(['open', 'mitigated', 'accepted', 'not applicable']);
    expect(screen.getByLabelText<HTMLSelectElement>('Status').value).toBe('open');
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

  it('sends nothing, and closes, when nothing changed', async () => {
    const { onSubmit, onCancel } = setup({ initial: initial as never });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
