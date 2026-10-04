import { useState } from 'react';
import { useCreateThreat, useElements, useModelMitigations, useThreats } from '../api/queries.js';
import { LoadError } from './LoadError.js';
import { ThreatForm } from './ThreatForm.js';
import { ThreatTable } from './ThreatTable.js';

// The threats of one threat model: the table, and the form to add one. The page reads the elements (for
// their names), the threats, and every mitigation of the model in one list each, however many threats
// the model holds (spec FR-010, M5 FR-002).
export function ThreatsSection({ threatModelId }: { threatModelId: string }) {
  const elements = useElements(threatModelId);
  const threats = useThreats(threatModelId);
  const mitigations = useModelMitigations(threatModelId);
  const create = useCreateThreat(threatModelId);
  const [adding, setAdding] = useState(false);

  const failed = [elements, threats, mitigations].filter((query) => query.isError);
  const loading = [elements, threats, mitigations].some((query) => query.isPending);

  return (
    <section aria-labelledby="threats-heading">
      <h2 id="threats-heading">Threats</h2>
      {adding ? (
        <ThreatForm
          threatModelId={threatModelId}
          onSubmit={async (input) => {
            await create.mutateAsync(input as Parameters<typeof create.mutateAsync>[0]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Add threat
        </button>
      )}
      {failed.length > 0 ? (
        <LoadError error={failed[0]?.error} onRetry={() => failed.forEach((query) => void query.refetch())} />
      ) : loading ? (
        <p>Loading…</p>
      ) : (
        threats.data &&
        mitigations.data &&
        elements.data && (
          <ThreatTable
            threatModelId={threatModelId}
            threats={threats.data}
            mitigations={mitigations.data}
            elements={elements.data}
          />
        )
      )}
    </section>
  );
}
