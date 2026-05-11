export interface WorldStatsProps {
  readonly locationCount: number;
  readonly agentCount: number;
  readonly itemCount: number;
}

export function WorldStats({ locationCount, agentCount, itemCount }: WorldStatsProps) {
  return (
    <div className="world-stats">
      <div className="world-stats__cell">
        <div className="world-stats__value">{locationCount}</div>
        <div className="world-stats__label">Locations</div>
      </div>
      <div className="world-stats__cell">
        <div className="world-stats__value">{agentCount}</div>
        <div className="world-stats__label">Agents</div>
      </div>
      <div className="world-stats__cell">
        <div className="world-stats__value">{itemCount}</div>
        <div className="world-stats__label">Items</div>
      </div>
    </div>
  );
}
