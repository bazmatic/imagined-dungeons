import type { WorldTree } from '@core/domain/builder-types';

/**
 * The union of tags that should appear as rows in the Lore master pane.
 *
 * - All tags on locations, items, agents, and templates.
 * - All tags that already have an authored `TagLore` row (so orphans remain
 *   editable/deletable even after the source entity loses the tag).
 *
 * Result is deduped and sorted ascending.
 */
export function collectLoreTags(tree: WorldTree): readonly string[] {
  const all: string[] = [];
  for (const l of tree.locations) all.push(...l.tags);
  for (const i of tree.items) all.push(...i.tags);
  for (const a of tree.agents) all.push(...a.tags);
  for (const t of tree.templates) all.push(...t.tags);
  for (const r of tree.tagLore) all.push(r.tag);
  return [...new Set(all)].sort((a, b) => a.localeCompare(b));
}

/** UI key for the world-lore pseudo-row in the Lore master pane. */
export const WORLD_LORE_SEL = 'world';
