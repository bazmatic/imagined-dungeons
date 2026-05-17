import type { NpcDecision } from '@core/domain/npc-decision';

interface SensoriumDecisionListProps {
  readonly decisions: NpcDecision[];
  readonly selectedId: number | null;
  readonly onSelect: (id: number) => void;
}

export function SensoriumDecisionList({ decisions, selectedId, onSelect }: SensoriumDecisionListProps) {
  if (decisions.length === 0) {
    return (
      <div className="sensorium-list sensorium-list--empty">
        <p className="t-metadata">No decisions recorded yet. Decisions are captured when an NPC acts.</p>
      </div>
    );
  }
  return (
    <div className="sensorium-list">
      <div className="sensorium-list__label t-label-caps">History</div>
      {decisions.map((d) => (
        <button
          key={d.id}
          type="button"
          className={`sensorium-list__item${d.id === selectedId ? ' sensorium-list__item--selected' : ''}`}
          onClick={() => onSelect(d.id)}
        >
          <span className="sensorium-list__timestamp">
            {new Date(d.createdAt).toLocaleTimeString()}
          </span>
          <span className="sensorium-list__location">
            {d.snapshot.perception.locationLabel}
          </span>
        </button>
      ))}
    </div>
  );
}
