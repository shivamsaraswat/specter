import type { ElementRecord } from '@specter/core';
import { useDiagramEditor } from './DiagramEditorProvider.js';
import { TYPE_LABELS } from './type-labels.js';

// What a screen reader is told when one element is selected (spec FR-026): what it is and what it is called,
// and where it is, which for a node is its trust boundary and for a flow its two ends. Empty for no selection
// and for several, which are announced by the usual selection count instead.
export function describeSelection(elements: readonly ElementRecord[], selectedIds: readonly string[]): string {
  const [id, ...more] = selectedIds;
  if (id === undefined || more.length > 0) return '';
  const byId = new Map(elements.map((element) => [element.id, element]));
  const element = byId.get(id);
  if (!element) return '';
  const name = (target: string | null): string => (target === null ? '?' : (byId.get(target)?.name ?? '?'));
  if (element.type === 'data_flow') {
    return `${TYPE_LABELS.data_flow} ${element.name}, from ${name(element.source_element_id)} to ${name(element.target_element_id)}`;
  }
  const inside = element.parent_boundary_id === null ? undefined : byId.get(element.parent_boundary_id);
  return `${TYPE_LABELS[element.type]} ${element.name}, in ${inside ? inside.name : 'no trust boundary'}`;
}

// A live region, out of sight, that speaks the selection. The words are text, never markup.
export function SelectionAnnouncer() {
  const { elements = [], selectedIds } = useDiagramEditor();
  return (
    <div role="status" aria-label="Selection" aria-live="polite" className="visually-hidden">
      {describeSelection(elements, selectedIds)}
    </div>
  );
}
