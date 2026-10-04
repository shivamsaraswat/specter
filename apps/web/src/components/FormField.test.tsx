import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorSummary } from './ErrorSummary.js';
import { FormField } from './FormField.js';

describe('FormField', () => {
  it('shows a visible label tied to its control', () => {
    render(<FormField id="name" label="Name">{(props) => <input {...props} />}</FormField>);
    const input = screen.getByLabelText('Name');
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('links an error to its control with aria-describedby and marks the control invalid', () => {
    render(
      <FormField id="name" label="Name" error="A project with this name already exists">
        {(props) => <input {...props} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe('A project with this name already exists');
  });

  it('shows a hint without marking the control invalid', () => {
    render(
      <FormField id="d" label="Description" hint="At most 10,000 characters">
        {(props) => <textarea {...props} />}
      </FormField>,
    );
    const area = screen.getByLabelText('Description');
    expect(area.getAttribute('aria-invalid')).toBeNull();
    expect(document.getElementById(area.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'At most 10,000 characters',
    );
  });
});

describe('ErrorSummary', () => {
  it('renders the message in an alert region, as text', () => {
    render(<ErrorSummary message={'<img src=x onerror=alert(1)>'} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(alert.querySelector('img')).toBeNull();
  });

  it('renders nothing without a message', () => {
    render(<ErrorSummary message={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
