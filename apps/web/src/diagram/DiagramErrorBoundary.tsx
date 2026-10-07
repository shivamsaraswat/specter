import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useDiagramEditor } from './DiagramEditorProvider.js';

// If the diagram's own screen breaks (the canvas, the panel, the toolbar), this stands in for it, and the
// editor above it carries on: its save queue is not part of what broke, so what the user already did is
// still being saved (spec FR-020, SC-005). The error itself is logged to the console for whoever is
// debugging and is never shown.
export class DiagramErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('The diagram stopped working', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <DiagramStopped onRetry={() => this.setState({ failed: false })} />;
  }
}

function DiagramStopped({ onRetry }: { onRetry: () => void }) {
  const { pendingCount, threatModelId } = useDiagramEditor();
  return (
    <div role="alert" className="diagram-stopped">
      <p>
        <strong>The diagram stopped working.</strong>
        {pendingCount > 0 && (
          <>
            {' '}
            Your {pendingCount} unsaved {pendingCount === 1 ? 'change is' : 'changes are'} still being saved.
          </>
        )}
      </p>
      <p>
        <button type="button" onClick={onRetry}>
          Show the diagram again
        </button>{' '}
        <button type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>{' '}
        <Link to={`/threat-models/${threatModelId}`}>Go to the Threats tab</Link>
      </p>
    </div>
  );
}
