import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '../diagram/Canvas.js';
import { DiagramErrorBoundary } from '../diagram/DiagramErrorBoundary.js';
import { DeleteDialogs } from '../diagram/DeleteDialogs.js';
import { ElementsList } from '../diagram/ElementsList.js';
import { PropertiesPanel } from '../diagram/PropertiesPanel.js';
import { SelectionAnnouncer } from '../diagram/SelectionAnnouncer.js';
import { Toolbar } from '../diagram/Toolbar.js';

// The Diagram tab: the threat model's data-flow diagram. Its state lives in the editor provider above
// the tabs; React Flow's provider is here so the toolbar can reach the viewport. If the screen breaks, the
// boundary stands in for it and the editor keeps saving.
export function DiagramTab() {
  return (
    <DiagramErrorBoundary>
      <ReactFlowProvider>
        <Toolbar />
        <div className="diagram-layout">
          <ElementsList />
          <Canvas />
          <PropertiesPanel />
        </div>
        <SelectionAnnouncer />
        <DeleteDialogs />
      </ReactFlowProvider>
    </DiagramErrorBoundary>
  );
}
