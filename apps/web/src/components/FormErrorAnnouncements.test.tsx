import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors.js';
import { MODEL_ID, PROJECT_ID, THREAT_ID, renderWithClient } from '../test-utils.js';
import { MitigationForm } from './MitigationForm.js';
import { ProjectForm } from './ProjectForm.js';
import { ThreatForm } from './ThreatForm.js';
import { ThreatModelForm } from './ThreatModelForm.js';

// A rejected form is announced and focused (contracts/ui.md, "Behavior rules"; spec FR-020, FR-015):
// an alert region names the fields to fix, focus moves to the first invalid control, and nothing the
// user typed is lost.
const noop = () => undefined;

describe('a client-side rejection', () => {
  it('ProjectForm announces the field and focuses it', async () => {
    renderWithClient(<ProjectForm onSubmit={vi.fn()} onCancel={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Fix 1 field: Name');
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
  });

  it('ThreatModelForm announces the field and focuses it', async () => {
    renderWithClient(<ThreatModelForm projectId={PROJECT_ID} onSubmit={vi.fn()} onCancel={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create threat model' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Fix 1 field: Name');
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
  });

  it('ThreatForm names every failing field, in form order, and focuses the first', async () => {
    renderWithClient(<ThreatForm threatModelId={MODEL_ID} onSubmit={vi.fn()} onCancel={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Fix 4 fields: Title, Category, Likelihood, Impact');
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  });

  it('ThreatForm focuses the first invalid field even when it is not the first one on the form', async () => {
    renderWithClient(<ThreatForm threatModelId={MODEL_ID} onSubmit={vi.fn()} onCancel={noop} />);
    await userEvent.type(screen.getByLabelText('Title'), 'A fine title');
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Fix 3 fields: Category, Likelihood, Impact');
    expect(document.activeElement).toBe(screen.getByLabelText('Category'));
  });

  it('MitigationForm announces the field and focuses it', async () => {
    renderWithClient(<MitigationForm threatId={THREAT_ID} onSubmit={vi.fn()} onCancel={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save mitigation' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Fix 1 field: Description');
    expect(document.activeElement).toBe(screen.getByLabelText('Description'));
  });

  it('clears the alert once the form is fixed and sent', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithClient(<ProjectForm onSubmit={onSubmit} onCancel={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Fix 1 field: Name');

    await userEvent.type(screen.getByLabelText('Name'), 'Payments');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('a server rejection that maps to a field', () => {
  it('is announced and focused too, and what was typed is kept', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, 'A project with this name already exists'));
    renderWithClient(<ProjectForm onSubmit={onSubmit} onCancel={noop} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Payments');
    await userEvent.type(screen.getByLabelText('Description'), 'kept');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Fix 1 field: Name');
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Payments');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Description').value).toBe('kept');
  });

  it('ThreatForm announces a server field message by its label, not its field name', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'title: must be at most 200 characters'));
    renderWithClient(<ThreatForm threatModelId={MODEL_ID} onSubmit={onSubmit} onCancel={noop} />);
    await userEvent.type(screen.getByLabelText('Title'), 'x');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Spoofing');
    await userEvent.selectOptions(screen.getByLabelText('Likelihood'), 'Low');
    await userEvent.selectOptions(screen.getByLabelText('Impact'), 'Low');
    await userEvent.click(screen.getByRole('button', { name: 'Add threat' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Fix 1 field: Title');
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  });

  it('MitigationForm labels the ticket field "Ticket URL"', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'external_ref: Invalid URL'));
    renderWithClient(<MitigationForm threatId={THREAT_ID} onSubmit={onSubmit} onCancel={noop} />);
    await userEvent.type(screen.getByLabelText('Description'), 'Do it');
    await userEvent.type(screen.getByLabelText('Ticket URL'), 'https://x.example');
    await userEvent.click(screen.getByRole('button', { name: 'Save mitigation' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Fix 1 field: Ticket URL');
    expect(document.activeElement).toBe(screen.getByLabelText('Ticket URL'));
  });
});

describe('a form-level rejection', () => {
  it('is still announced as its own message, with no field summary', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(500, 'Internal server error'));
    renderWithClient(<ProjectForm onSubmit={onSubmit} onCancel={noop} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Payments');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Internal server error');
  });
});
