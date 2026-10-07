import { Link } from 'react-router';
import { useProject, useThreatModel } from '../api/queries.js';
import { useDiagramEditor } from './DiagramEditorProvider.js';

const changes = (count: number): string => `${count} ${count === 1 ? 'change' : 'changes'}`;

// Whether the latest changes are saved (spec FR-020, FR-026). Saved and saving are announced politely; a
// failure is an alert, because the user has something to do about it.
export function SaveStatus() {
  const { status, pendingCount, retry, threatModelId } = useDiagramEditor();

  if (status === 'gone') {
    return (
      <p role="alert" className="diagram-save diagram-save--failed">
        This threat model no longer exists. <WayBack threatModelId={threatModelId} />
      </p>
    );
  }
  if (status === 'failed') {
    return (
      <p role="alert" className="diagram-save diagram-save--failed">
        Not saved. {changes(pendingCount)} kept on screen.{' '}
        <button type="button" onClick={retry}>
          Retry
        </button>
      </p>
    );
  }
  return (
    <span role="status" aria-live="polite" className="diagram-save">
      {status === 'saving' ? 'Saving…' : 'All changes saved'}
    </span>
  );
}

// The way out of a threat model that is gone: back to its project, by name. The model and its project are
// still in the app's cache from when the page opened; if either is not known, the project list will do.
function WayBack({ threatModelId }: { threatModelId: string }) {
  const model = useThreatModel(threatModelId);
  const project = useProject(model.data?.project_id);
  if (model.data && project.data) return <Link to={`/projects/${model.data.project_id}`}>Back to {project.data.name}</Link>;
  return <Link to="/projects">Back to projects</Link>;
}
