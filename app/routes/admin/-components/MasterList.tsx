import { type ReactNode, useMemo, useState } from 'react';

export interface MasterListItem {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
}

export interface MasterListProps {
  readonly items: readonly MasterListItem[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
  readonly filterPlaceholder?: string;
  readonly emptyHint?: string;
  readonly header?: ReactNode;
}

export function MasterList({
  items,
  selectedId,
  onSelect,
  filterPlaceholder,
  emptyHint,
  header,
}: MasterListProps) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  const visible = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label));
    if (q === '') return sorted;
    return sorted.filter(
      (i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
    );
  }, [items, q]);

  return (
    <>
      <div className="master-pane__footer">
        <input
          type="text"
          className="master-pane__filter"
          placeholder={filterPlaceholder ?? 'Filter…'}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="master-pane__body">
        {header ? <div className="master-pane__header-slot">{header}</div> : null}
        {visible.length === 0 ? (
          <p className="t-metadata" style={{ fontStyle: 'italic', padding: 'var(--s-3)' }}>
            {q === '' ? (emptyHint ?? 'No entries yet.') : 'No matches.'}
          </p>
        ) : (
          visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tree-leaf${selectedId === item.id ? ' tree-leaf--selected' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <div>{item.label}</div>
              {item.subtitle ? (
                <div
                  className="t-data-sm"
                  style={{ color: 'var(--parchment-dim)', fontStyle: 'italic' }}
                >
                  {item.subtitle}
                </div>
              ) : null}
            </button>
          ))
        )}
      </div>
    </>
  );
}
