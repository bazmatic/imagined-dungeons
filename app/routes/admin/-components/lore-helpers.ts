import type { WorldTree } from '@core/domain/builder-types';

/**
 * The set of tags that should appear as rows in the Lore master pane.
 *
 * Authored vocabulary only: every tag in the result has a `TagLore` row in
 * `tree.tagLore`. Entity tags are NOT unioned in — under the authored-only
 * model, the only way a tag exists is via a `TagLore` row, and entity forms
 * can only pick from this authored list.
 *
 * Result is deduped and sorted ascending.
 */
export function collectLoreTags(tree: WorldTree): readonly string[] {
  return [...new Set(tree.tagLore.map((r) => r.tag))].sort((a, b) => a.localeCompare(b));
}

/** UI key for the world-lore pseudo-row in the Lore master pane. */
export const WORLD_LORE_SEL = 'world';
