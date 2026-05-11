import { EntityKind } from '@core/domain/builder-kinds';
import type { Problem } from '@core/domain/builder-types';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export interface ProblemsRailProps {
  readonly problems: readonly Problem[];
  readonly onSelect: (sel: { readonly kind: EntityKindValue; readonly id: string }) => void;
}

export function ProblemsRail({ problems, onSelect }: ProblemsRailProps) {
  return (
    <aside className="problems-pane">
      <h3 className="t-label-caps" style={{ marginBottom: 12 }}>
        Problems ({problems.length})
      </h3>
      {problems.length === 0 ? (
        <p className="t-metadata" style={{ fontStyle: 'italic' }}>
          No problems.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {problems.map((p) => (
            <li
              key={`${p.entity}:${p.entityId}:${p.kind}`}
              className="problem-row"
              onClick={() => onSelect({ kind: p.entity, id: p.entityId })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect({ kind: p.entity, id: p.entityId });
              }}
              role="button"
              tabIndex={0}
            >
              <span className="chip">{p.entity}</span>
              <span className="t-data-sm">{p.message}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
