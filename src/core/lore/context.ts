import type { BuilderRepository } from '@core/builder/repository';
import type { LoreContext, LoreSubject } from '@core/domain/builder-types';
import type { WorldId } from '@core/domain/ids';
import type { HandlerRepo } from '@core/engine/repository';

/**
 * Pure resolver: assembles the `LoreContext` for a subject by unioning the
 * subject's own tags with its (optional) location's tags, then pulling each
 * matching `TagLore.description` from the builder repository. Tags without a
 * matching `TagLore` row contribute nothing.
 */
export async function loadLoreContext(
  repo: BuilderRepository,
  engineRepo: HandlerRepo,
  worldId: WorldId,
  subject: LoreSubject,
): Promise<LoreContext> {
  const world = await repo.readWorldLore(worldId);

  const tagSet = new Set<string>(subject.tags);
  if (subject.locationId !== null) {
    const loc = await engineRepo.getLocation(subject.locationId);
    for (const tag of loc.tags) tagSet.add(tag);
  }

  const tagDescriptions: Record<string, string> = {};
  for (const tag of tagSet) {
    const row = await repo.getTagLoreByTag(worldId, tag);
    if (row) tagDescriptions[tag] = row.description;
  }

  return {
    worldOverview: world.worldOverview,
    storySoFar: world.storySoFar,
    tagDescriptions,
  };
}
