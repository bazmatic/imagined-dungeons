import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';
import { useMemo, useState } from 'react';
import { isExpanded, makeKey, toggleNode } from './tree-state';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export interface SelectedRef {
  readonly kind: EntityKindValue | 'world';
  readonly id?: string;
}

export interface WorldHierarchyTreeProps {
  readonly tree: WorldTree;
  readonly sel: SelectedRef;
  readonly onSelect: (s: SelectedRef) => void;
  readonly problemDots: ReadonlySet<string>; // keys: `${entity}:${entityId}`
}

const SUBGROUPS = ['exits', 'agents', 'items', 'triggers'] as const;
type SubGroup = (typeof SUBGROUPS)[number];

export function WorldHierarchyTree({ tree, sel, onSelect, problemDots }: WorldHierarchyTreeProps) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const lowerFilter = filter.trim().toLowerCase();

  const visibleLocations = useMemo(() => {
    if (lowerFilter === '') return tree.locations;
    return tree.locations.filter((l) => l.label.toLowerCase().includes(lowerFilter));
  }, [tree.locations, lowerFilter]);

  const toggle = (key: string): void => {
    setExpanded((prev) => toggleNode(prev, key));
  };

  const dotFor = (kind: string, id: string) =>
    problemDots.has(`${kind}:${id}`) ? <span className="tree-item__dot">●</span> : null;

  const isSel = (kind: EntityKindValue, id: string): boolean => sel.kind === kind && sel.id === id;

  return (
    <>
      <div className="master-pane__body">
        <button
          type="button"
          className={`tree-group__header${sel.kind === 'world' ? ' tree-group__header--selected' : ''}`}
          onClick={() => onSelect({ kind: 'world' })}
        >
          <span className="tree-group__caret" />
          World settings
        </button>

        {visibleLocations.map((loc) => {
          const locId = loc.id as string;
          const locKey = makeKey('location', locId);
          const open = isExpanded(expanded, locKey);
          const exitsHere = tree.exits.filter((e) => (e.from as string) === locId);
          const agentsHere = tree.agents.filter((a) => (a.locationId as string) === locId);
          const itemsHere = tree.items.filter(
            (i) => i.owner.kind === OwnerKind.Location && (i.owner.id as string) === locId,
          );
          const triggersHere = tree.triggers.filter((t) => (t.locationId as string) === locId);
          const subgroupRows: Record<
            SubGroup,
            readonly { id: string; label: string; kind: EntityKindValue }[]
          > = {
            exits: exitsHere.map((e) => ({
              id: e.id as string,
              label: `${e.direction} → ${e.to}`,
              kind: EntityKind.Exit,
            })),
            agents: agentsHere.map((a) => ({
              id: a.id as string,
              label: a.label,
              kind: EntityKind.Agent,
            })),
            items: itemsHere.map((i) => ({
              id: i.id as string,
              label: i.label,
              kind: EntityKind.Item,
            })),
            triggers: triggersHere.map((t) => ({
              id: t.id as string,
              label: `${t.params.kind} → ${t.templateId} ×${t.count}`,
              kind: EntityKind.LocationSpawnTrigger,
            })),
          };

          return (
            <div key={locId} className="tree-group">
              <div className="tree-group__row">
                <button
                  type="button"
                  className="tree-group__caret"
                  onClick={() => toggle(locKey)}
                  aria-label={open ? 'Collapse' : 'Expand'}
                >
                  {open ? '▾' : '▸'}
                </button>
                <button
                  type="button"
                  className={`tree-group__header${isSel(EntityKind.Location, locId) ? ' tree-group__header--selected' : ''}`}
                  onClick={() => onSelect({ kind: EntityKind.Location, id: locId })}
                >
                  <span>{loc.label}</span>
                  {dotFor(EntityKind.Location, locId)}
                </button>
              </div>
              {open ? (
                <div className="tree-subgroup">
                  {SUBGROUPS.map((sub) => {
                    const rows = subgroupRows[sub];
                    if (rows.length === 0) return null;
                    const subKey = makeKey(`${locId}-${sub}`, '');
                    const subOpen = isExpanded(expanded, subKey);
                    return (
                      <div key={sub}>
                        <button
                          type="button"
                          className="tree-subgroup__header"
                          onClick={() => toggle(subKey)}
                        >
                          <span>{subOpen ? '▾' : '▸'}</span>
                          <span>
                            {sub} ({rows.length})
                          </span>
                        </button>
                        {subOpen
                          ? rows.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                className={`tree-leaf${isSel(r.kind, r.id) ? ' tree-leaf--selected' : ''}`}
                                onClick={() => onSelect({ kind: r.kind, id: r.id })}
                              >
                                {r.label}
                                {dotFor(r.kind, r.id)}
                              </button>
                            ))
                          : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="master-pane__footer">
        <input
          type="text"
          className="master-pane__filter"
          placeholder="Filter locations…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
    </>
  );
}
