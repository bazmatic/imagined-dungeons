import type { EntityKind } from '@core/domain/builder-kinds';
import type { Problem } from '@core/domain/builder-types';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export interface ProblemsRailProps {
  readonly problems: readonly Problem[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelect: (sel: { readonly kind: EntityKindValue; readonly id: string }) => void;
}

export function ProblemsRail({ problems, open, onClose, onSelect }: ProblemsRailProps) {
  return (
    <aside className={`problems-drawer${open ? ' problems-drawer--open' : ''}`}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 className="t-label-caps">Problems ({problems.length})</h3>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      {problems.length === 0 ? (
        <p className="t-metadata" style={{ fontStyle: 'italic' }}>
          No problems.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {problems.map((p) => (
            <li key={`${p.entity}:${p.entityId}:${p.kind}`} className="problem-row">
              <button
                type="button"
                className="btn"
                style={{ display: 'block', textAlign: 'left' }}
                onClick={() => onSelect({ kind: p.entity, id: p.entityId })}
              >
                <span className="chip">{p.entity}</span>
                <div className="t-data-sm" style={{ marginTop: 4 }}>
                  {p.message}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
