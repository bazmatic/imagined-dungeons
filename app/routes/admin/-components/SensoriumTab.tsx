import type { NpcDecision } from '@core/domain/npc-decision';
import { useEffect, useState } from 'react';
import { getNpcDecisions } from '~/server/admin/sensorium';
import { SensoriumDecisionDetail } from './SensoriumDecisionDetail';
import { SensoriumDecisionList } from './SensoriumDecisionList';

interface SensoriumTabProps {
  readonly worldId: string;
  readonly agentId: string;
}

export function SensoriumTab({ worldId, agentId }: SensoriumTabProps) {
  const [decisions, setDecisions] = useState<NpcDecision[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDecisions(null);
    setSelectedId(null);
    setError(null);
    getNpcDecisions({ data: { worldId, agentId } })
      .then((results) => {
        setDecisions(results);
        setSelectedId(results[0]?.id ?? null);
      })
      .catch((e: unknown) => setError(String(e)));
  }, [worldId, agentId]);

  if (error) {
    return <p className="t-metadata" style={{ color: 'var(--c-error, #f44)' }}>Failed to load: {error}</p>;
  }

  if (decisions === null) {
    return <p className="t-metadata">Loading…</p>;
  }

  const selected = decisions.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="sensorium-pane">
      <SensoriumDecisionList
        decisions={decisions}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <div className="sensorium-pane__detail">
        {selected
          ? <SensoriumDecisionDetail decision={selected} />
          : <p className="t-metadata">No decisions recorded yet.</p>
        }
      </div>
    </div>
  );
}
