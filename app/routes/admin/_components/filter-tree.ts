import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export interface PaletteResult {
  readonly kind: EntityKindValue;
  readonly id: string;
  readonly label: string;
}

const MAX_RESULTS = 50;

export function filterTree(tree: WorldTree, query: string): readonly PaletteResult[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];

  const results: PaletteResult[] = [];

  const push = (kind: EntityKindValue, id: string, label: string): void => {
    if (results.length >= MAX_RESULTS) return;
    if (id.toLowerCase().includes(q) || label.toLowerCase().includes(q)) {
      results.push({ kind, id, label });
    }
  };

  for (const l of tree.locations) push(EntityKind.Location, l.id as string, l.label);
  for (const e of tree.exits) push(EntityKind.Exit, e.id as string, `${e.direction} → ${e.to}`);
  for (const a of tree.agents) push(EntityKind.Agent, a.id as string, a.label);
  for (const i of tree.items) push(EntityKind.Item, i.id as string, i.label);
  for (const t of tree.templates) push(EntityKind.MonsterTemplate, t.id as string, t.label);
  for (const t of tree.triggers)
    push(EntityKind.LocationSpawnTrigger, t.id as string, `${t.params.kind} → ${t.templateId}`);

  return results;
}
