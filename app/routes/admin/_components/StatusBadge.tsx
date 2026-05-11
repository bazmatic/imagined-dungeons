import { WorldKind } from '@core/domain/builder-kinds';

export interface StatusBadgeProps {
  readonly kind: (typeof WorldKind)[keyof typeof WorldKind];
  readonly id: string;
}

export function StatusBadge({ kind, id }: StatusBadgeProps) {
  const isLive = kind === WorldKind.Live;
  const modifier = isLive ? 'status-badge--live' : 'status-badge--draft';
  const label = isLive ? 'LIVE' : 'DRAFT';
  return (
    <span className={`status-badge ${modifier}`}>
      <span>{label}</span>
      <span className="status-badge__id">{id}</span>
    </span>
  );
}
