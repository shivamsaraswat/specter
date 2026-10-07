import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddFlowDialog } from './AddFlowDialog.js';
import { INVALID_FLOW_MESSAGE } from './connect.js';
import { eid, el, fakeEditor, renderWithEditor } from './test-helpers.js';

// FR-025, US5 scenario 2: a data flow is created from the keyboard by choosing its two ends from lists.

const elements = [
  el(1, { type: 'external_entity', name: 'Customer' }),
  el(2, { type: 'process', name: 'API' }),
  el(3, { type: 'data_store', name: 'DB' }),
  el(4, { type: 'trust_boundary', name: 'VPC', layout: { x: 0, y: 0, width: 300, height: 200 } }),
  el(5, { type: 'data_flow', name: 'Query', layout: null, source_element_id: eid(2), target_element_id: eid(3) }),
];

function open(onClose = vi.fn()) {
  const editor = fakeEditor({ elements });
  renderWithEditor(<AddFlowDialog onClose={onClose} />, editor);
  return { editor, onClose, dialog: screen.getByRole('dialog') };
}

describe('AddFlowDialog', () => {
  it('has a Source and a Target list of only the elements a flow can join', () => {
    const { dialog } = open();
    for (const label of ['Source', 'Target']) {
      const select = within(dialog).getByLabelText<HTMLSelectElement>(label);
      expect([...select.options].map((option) => option.textContent)).toEqual(['API (process)', 'Customer (external entity)', 'DB (data store)']);
    }
  });

  it('creates a data flow named "New data flow" between the two chosen, selects it, and closes', async () => {
    const { editor, onClose, dialog } = open();
    const user = userEvent.setup();

    await user.selectOptions(within(dialog).getByLabelText('Source'), eid(1));
    await user.selectOptions(within(dialog).getByLabelText('Target'), eid(3));
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    const op = vi.mocked(editor.apply).mock.calls[0]?.[0].ops[0];
    expect(op).toMatchObject({ op: 'create', element: { type: 'data_flow', name: 'New data flow', source_element_id: eid(1), target_element_id: eid(3) } });
    const id = op?.op === 'create' ? op.element.id : '';
    expect(editor.select).toHaveBeenCalledWith([id]);
    expect(editor.requestNameFocus).toHaveBeenCalledWith(id);
    expect(onClose).toHaveBeenCalled();
  });

  it('refuses the same element at both ends, with the reason, and creates nothing', async () => {
    const { editor, onClose, dialog } = open();
    const user = userEvent.setup();

    await user.selectOptions(within(dialog).getByLabelText('Source'), eid(2));
    await user.selectOptions(within(dialog).getByLabelText('Target'), eid(2));
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(editor.apply).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert').textContent).toBe(INVALID_FLOW_MESSAGE);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('starts with two different ends chosen, so Create works at once', async () => {
    const { editor, dialog } = open();
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Create' }));
    const op = vi.mocked(editor.apply).mock.calls[0]?.[0].ops[0];
    expect(op?.op === 'create' && op.element.source_element_id).not.toBe(op?.op === 'create' && op.element.target_element_id);
  });

  it('closes on Cancel and on Escape, creating nothing', async () => {
    const first = open();
    const user = userEvent.setup();
    await user.click(within(first.dialog).getByRole('button', { name: 'Cancel' }));
    expect(first.onClose).toHaveBeenCalledTimes(1);
    expect(first.editor.apply).not.toHaveBeenCalled();

    document.body.innerHTML = '';
    const second = open();
    await user.keyboard('{Escape}');
    expect(second.onClose).toHaveBeenCalled();
    expect(second.editor.apply).not.toHaveBeenCalled();
  });
});
