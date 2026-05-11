import type { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { useEffect, useMemo, useState } from 'react';
import { type PaletteResult, filterTree } from './filter-tree';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export interface CommandPaletteProps {
  readonly tree: WorldTree;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelect: (sel: { readonly kind: EntityKindValue; readonly id: string }) => void;
}

export function CommandPalette({ tree, open, onClose, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const results: readonly PaletteResult[] = useMemo(
    () => (open ? filterTree(tree, query) : []),
    [tree, query, open],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset highlight when query changes
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[highlight];
      if (r) {
        onSelect({ kind: r.kind, id: r.id });
        onClose();
      }
    }
  };

  return (
    <div
      className="palette-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="presentation"
    >
      <div
        className="palette"
        onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()}
        role="presentation"
      >
        <input
          className="palette__input"
          placeholder="Jump to entity..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="palette__results">
          {results.map((r, idx) => (
            <li key={`${r.kind}:${r.id}`}>
              <button
                className={`palette__result ${idx === highlight ? 'palette__result--active' : ''}`}
                onClick={() => {
                  onSelect({ kind: r.kind, id: r.id });
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSelect({ kind: r.kind, id: r.id });
                    onClose();
                  }
                }}
                type="button"
              >
                <span className="chip">{r.kind}</span>
                <span className="t-data">{r.label}</span>
                <span className="palette__result-id">{r.id}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
