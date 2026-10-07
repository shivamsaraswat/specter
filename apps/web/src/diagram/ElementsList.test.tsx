import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ElementsList } from './ElementsList.js';
import { eid, el, fakeEditor, renderWithEditor } from './test-helpers.js';

// FR-025: every element can be reached, and chosen, without a mouse.

const elements = [
  el(1, { type: 'process', name: 'API' }),
  el(2, { type: 'trust_boundary', name: 'VPC', layout: { x: 0, y: 0, width: 300, height: 200 } }),
  el(3, { type: 'data_store', name: 'DB' }),
  el(4, { type: 'data_flow', name: 'Query', layout: null, source_element_id: eid(1), target_element_id: eid(3) }),
  el(5, { type: 'external_entity', name: 'Customer' }),
];

describe('ElementsList', () => {
  it('is a navigation named "Elements" that lists every element by type and name', () => {
    renderWithEditor(<ElementsList />, fakeEditor({ elements }));
    const list = screen.getByRole('navigation', { name: 'Elements' });
    const names = within(list).getAllByRole('button').map((button) => button.textContent);
    expect(names).toEqual(expect.arrayContaining(['Process: API', 'Trust boundary: VPC', 'Data store: DB', 'Data flow: Query', 'External entity: Customer']));
    expect(names).toHaveLength(5);
  });

  it('lists boundaries first, then nodes, then flows, each group by name', () => {
    renderWithEditor(<ElementsList />, fakeEditor({ elements }));
    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(names).toEqual(['Trust boundary: VPC', 'Process: API', 'External entity: Customer', 'Data store: DB', 'Data flow: Query']);
  });

  it('says so when there is nothing yet', () => {
    renderWithEditor(<ElementsList />, fakeEditor({ elements: [] }));
    expect(screen.getByText('No elements yet')).toBeTruthy();
  });

  it('selects an element when it is activated, and moves focus to it on the canvas', async () => {
    const editor = fakeEditor({ elements });
    // A stand-in for the node React Flow draws, which carries the element's id.
    document.body.insertAdjacentHTML('beforeend', `<div class="react-flow__node" data-id="${eid(3)}" tabindex="0">DB</div>`);
    const user = userEvent.setup();
    renderWithEditor(<ElementsList />, editor);

    await user.click(screen.getByRole('button', { name: 'Data store: DB' }));

    expect(editor.select).toHaveBeenCalledWith([eid(3)]);
    expect(document.activeElement?.getAttribute('data-id')).toBe(eid(3));
    document.querySelector('.react-flow__node')?.remove();
  });

  it('marks the selected element as current', () => {
    renderWithEditor(<ElementsList />, fakeEditor({ elements, selectedIds: [eid(3)] }));
    expect(screen.getByRole('button', { name: 'Data store: DB' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: 'Process: API' }).getAttribute('aria-current')).toBeNull();
  });

  it('shows a name with markup as text (FR-027)', () => {
    const { container } = renderWithEditor(<ElementsList />, fakeEditor({ elements: [el(1, { name: '<img src=x onerror=alert(1)>' })] }));
    expect(screen.getByText('Process: <img src=x onerror=alert(1)>')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });
});
