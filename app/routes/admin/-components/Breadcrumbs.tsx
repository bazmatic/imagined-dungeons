import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';

type SelectedKind =
  | typeof EntityKind.Location
  | typeof EntityKind.Exit
  | typeof EntityKind.Agent
  | typeof EntityKind.Item
  | typeof EntityKind.MonsterTemplate
  | typeof EntityKind.LocationSpawnTrigger;

export interface BreadcrumbsProps {
  readonly tree: WorldTree;
  readonly sel: { readonly kind: SelectedKind; readonly id: string } | { readonly kind: 'world' };
}

export function Breadcrumbs({ tree, sel }: BreadcrumbsProps) {
  const worldName = tree.summary.displayName || tree.summary.label;
  const segments = buildSegments(tree, sel, worldName);
  return <nav className="t-breadcrumb">{segments.join(' / ')}</nav>;
}

function buildSegments(
  tree: WorldTree,
  sel: BreadcrumbsProps['sel'],
  worldName: string,
): readonly string[] {
  if (sel.kind === 'world') {
    return [worldName];
  }
  if (sel.kind === EntityKind.Location) {
    const loc = tree.locations.find((l) => (l.id as string) === sel.id);
    return ['Aethelgard', 'World Editor', worldName, 'Locations', loc?.label ?? sel.id];
  }
  if (sel.kind === EntityKind.MonsterTemplate) {
    const tpl = tree.templates.find((t) => (t.id as string) === sel.id);
    return ['Aethelgard', 'World Editor', worldName, 'Bestiary', tpl?.label ?? sel.id];
  }
  if (sel.kind === EntityKind.Exit) {
    const ex = tree.exits.find((e) => (e.id as string) === sel.id);
    const parent = ex ? tree.locations.find((l) => (l.id as string) === (ex.from as string)) : null;
    return [
      'Aethelgard',
      'World Editor',
      worldName,
      'Locations',
      parent?.label ?? '?',
      'Exit',
      ex?.direction ?? sel.id,
    ];
  }
  if (sel.kind === EntityKind.Agent) {
    const ag = tree.agents.find((a) => (a.id as string) === sel.id);
    const parent = ag
      ? tree.locations.find((l) => (l.id as string) === (ag.locationId as string))
      : null;
    return [
      'Aethelgard',
      'World Editor',
      worldName,
      'Locations',
      parent?.label ?? '?',
      'Agent',
      ag?.label ?? sel.id,
    ];
  }
  if (sel.kind === EntityKind.LocationSpawnTrigger) {
    const trg = tree.triggers.find((t) => (t.id as string) === sel.id);
    const parent = trg
      ? tree.locations.find((l) => (l.id as string) === (trg.locationId as string))
      : null;
    return [
      'Aethelgard',
      'World Editor',
      worldName,
      'Locations',
      parent?.label ?? '?',
      'Trigger',
      sel.id,
    ];
  }
  // Item
  const item = tree.items.find((i) => (i.id as string) === sel.id);
  return ['Aethelgard', 'World Editor', worldName, 'Items', item?.label ?? sel.id];
}
