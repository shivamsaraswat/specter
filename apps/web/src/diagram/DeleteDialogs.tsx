import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useThreats } from '../api/queries.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { planDelete } from './delete-plan.js';
import { useDiagramEditor } from './DiagramEditorProvider.js';

// Carries out a request to delete an element (from the Delete key or the properties panel). It looks at the
// threats first: if any is linked to the element, or to a flow that would go with it, nothing is sent and the
// threats are listed. A node with flows asks first. Everything else is deleted at once.
export function DeleteDialogs() {
  const editor = useDiagramEditor();
  const { deleteRequest: id, elements = [], threatModelId, apply, select, clearDeleteRequest } = editor;
  const threats = useThreats(threatModelId);
  // If the threats could not be read the server still refuses a delete that would orphan one, so go on.
  const known = threats.data ?? (threats.isError ? [] : null);
  const plan = id && known ? planDelete(elements, known, id) : null;
  const element = id ? elements.find((candidate) => candidate.id === id) : undefined;

  const done = useRef<string | null>(null);
  useEffect(() => {
    if (id === null) done.current = null;
    if (plan?.kind !== 'now' || !id || done.current === id) return;
    done.current = id;
    apply({ label: `Delete ${element?.name ?? 'element'}`, ops: [{ op: 'delete', id }] });
    select([]);
    clearDeleteRequest();
  }, [plan, id, element, apply, select, clearDeleteRequest]);

  if (!id || !plan || plan.kind === 'now') return null;
  if (plan.kind === 'confirm') {
    const many = plan.flows !== 1;
    return (
      <ConfirmDialog
        title={`Delete ${element?.name ?? 'this element'} and its ${plan.flows} data ${many ? 'flows' : 'flow'}?`}
        message={`${many ? 'These flows are' : 'This flow is'} deleted with it.`}
        confirmLabel="Delete"
        onConfirm={() => {
          apply({ label: `Delete ${element?.name ?? 'element'}`, ops: [{ op: 'delete', id }] });
          select([]);
          clearDeleteRequest();
        }}
        onCancel={clearDeleteRequest}
      />
    );
  }
  return <LinkedThreats threats={plan.threats} threatModelId={threatModelId} onClose={clearDeleteRequest} />;
}

// The delete is refused: here are the threats in the way, and where to deal with them.
function LinkedThreats({
  threats,
  threatModelId,
  onClose,
}: {
  threats: { id: string; title: string; elementName: string }[];
  threatModelId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    element?.querySelector('button')?.focus();
    return () => {
      element?.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="linked-threats-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id="linked-threats-title">This element can&apos;t be deleted yet</h2>
      <p>These threats are linked to it, or to a data flow that would be deleted with it. Delete them first.</p>
      <ul>
        {threats.map((threat) => (
          <li key={threat.id}>
            {threat.title} (on {threat.elementName})
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
        <Link to={`/threat-models/${threatModelId}`}>Open the Threats tab</Link>
      </div>
    </dialog>
  );
}
