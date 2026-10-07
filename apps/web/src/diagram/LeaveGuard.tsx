import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { useDiagramEditor } from './DiagramEditorProvider.js';

// Warns before unsaved changes are lost (spec FR-020). Moving about inside the threat model, between its
// Diagram and Threats tabs, loses nothing and is never blocked. Leaving it asks first, and closing or
// reloading the tab asks the browser to. Only a router that is a data router can block navigation.
export function LeaveGuard() {
  const { threatModelId, pendingCount } = useDiagramEditor();
  const here = `/threat-models/${threatModelId}`;
  const blocker = useBlocker(
    ({ nextLocation }) => pendingCount > 0 && nextLocation.pathname !== here && !nextLocation.pathname.startsWith(`${here}/`),
  );
  const unsaved = pendingCount > 0;

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // If the last change is saved while the question is open, there is nothing left to ask about.
  useEffect(() => {
    if (blocker.state === 'blocked' && !unsaved) blocker.proceed();
  }, [blocker, unsaved]);

  if (blocker.state !== 'blocked') return null;
  const one = pendingCount === 1;
  return (
    <ConfirmDialog
      title="Leave without saving?"
      message={`You have ${pendingCount} unsaved ${one ? 'change' : 'changes'}. If you leave, ${one ? 'it is' : 'they are'} lost.`}
      confirmLabel="Leave"
      cancelLabel="Stay"
      onConfirm={() => blocker.proceed()}
      onCancel={() => blocker.reset()}
    />
  );
}
