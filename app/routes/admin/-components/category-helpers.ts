import type { Agent, Item, Location } from '@core/domain/entities';
import { OwnerKind } from '@core/domain/kinds';

export const CATEGORIES = ['locations', 'bestiary', 'agents', 'items'] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

export const VIEWS = ['settings'] as const;
export type View = (typeof VIEWS)[number];

export interface AdminSearch {
  readonly cat: Category;
  readonly sel?: string;
  readonly view?: View;
}

export function parseSearchParams(raw: Record<string, unknown>): AdminSearch {
  const cat = isCategory(raw.cat) ? raw.cat : 'locations';
  const sel = typeof raw.sel === 'string' && raw.sel.length > 0 ? raw.sel : undefined;
  const view = raw.view === 'settings' ? ('settings' as const) : undefined;
  const result: AdminSearch = {
    cat,
    ...(sel !== undefined ? { sel } : {}),
    ...(view !== undefined ? { view } : {}),
  };
  return result;
}

export function resolveOwnerSubtitle(
  item: Item,
  locations: readonly Location[],
  agents: readonly Agent[],
  items: readonly Item[],
): string {
  const ownerId = item.owner.id as string;
  if (item.owner.kind === OwnerKind.Location) {
    const loc = locations.find((l) => (l.id as string) === ownerId);
    return `in ${loc?.label ?? ownerId}`;
  }
  if (item.owner.kind === OwnerKind.Agent) {
    const a = agents.find((x) => (x.id as string) === ownerId);
    return `carried by ${a?.label ?? ownerId}`;
  }
  const parent = items.find((x) => (x.id as string) === ownerId);
  return `inside ${parent?.label ?? ownerId}`;
}
