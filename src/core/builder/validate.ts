import { EntityKind, ProblemKind } from '@core/domain/builder-kinds';
import type { Problem, WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';

/**
 * Pure structural validator. Catches every constraint the engine assumes
 * holds at runtime: referential integrity for exits/items/agents and the
 * presence + resolvability of the player agent. Returns an empty array for
 * a clean tree; non-empty results are the publish gate.
 */
export function validateWorld(tree: WorldTree): Problem[] {
  const problems: Problem[] = [];
  const locIds = new Set(tree.locations.map((l) => l.id as string));
  const itemIds = new Set(tree.items.map((i) => i.id as string));
  const agentIds = new Set(tree.agents.map((a) => a.id as string));

  // Duplicate ids (within entity kind).
  const checkDup = (
    ids: readonly string[],
    entity: (typeof EntityKind)[keyof typeof EntityKind],
  ) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        problems.push({
          kind: ProblemKind.DuplicateId,
          entity,
          entityId: id,
          message: `duplicate ${entity} id: ${id}`,
        });
      }
      seen.add(id);
    }
  };
  checkDup(
    tree.locations.map((l) => l.id as string),
    EntityKind.Location,
  );
  checkDup(
    tree.exits.map((e) => e.id as string),
    EntityKind.Exit,
  );
  checkDup(
    tree.items.map((i) => i.id as string),
    EntityKind.Item,
  );
  checkDup(
    tree.agents.map((a) => a.id as string),
    EntityKind.Agent,
  );

  // Exits.
  for (const e of tree.exits) {
    if (!locIds.has(e.from as string)) {
      problems.push({
        kind: ProblemKind.ExitFromMissing,
        entity: EntityKind.Exit,
        entityId: e.id as string,
        message: `exit ${e.id} from missing location ${e.from}`,
      });
    }
    if (!locIds.has(e.to as string)) {
      problems.push({
        kind: ProblemKind.ExitToMissing,
        entity: EntityKind.Exit,
        entityId: e.id as string,
        message: `exit ${e.id} to missing location ${e.to}`,
      });
    }
    if (e.lockedByItem !== null && !itemIds.has(e.lockedByItem as string)) {
      problems.push({
        kind: ProblemKind.ExitLockedByItemMissing,
        entity: EntityKind.Exit,
        entityId: e.id as string,
        message: `exit ${e.id} locked by missing item ${e.lockedByItem}`,
      });
    }
  }

  // Items.
  for (const it of tree.items) {
    const ownerKind = it.owner.kind;
    const ownerId = it.owner.id as string;
    const set =
      ownerKind === OwnerKind.Location
        ? locIds
        : ownerKind === OwnerKind.Agent
          ? agentIds
          : itemIds;
    if (!set.has(ownerId)) {
      problems.push({
        kind: ProblemKind.ItemOwnerMissing,
        entity: EntityKind.Item,
        entityId: it.id as string,
        message: `item ${it.id} owner ${ownerKind}:${ownerId} not found`,
      });
    }
  }

  // Agents.
  for (const a of tree.agents) {
    if (!locIds.has(a.locationId as string)) {
      problems.push({
        kind: ProblemKind.AgentLocationMissing,
        entity: EntityKind.Agent,
        entityId: a.id as string,
        message: `agent ${a.id} at missing location ${a.locationId}`,
      });
    }
  }

  // Player agent.
  const player = tree.summary.playerAgentId;
  if (player === null) {
    problems.push({
      kind: ProblemKind.PlayerAgentNotSet,
      entity: EntityKind.Agent,
      entityId: '',
      message: 'world has no player agent set',
    });
  } else if (!agentIds.has(player as string)) {
    problems.push({
      kind: ProblemKind.PlayerAgentMissing,
      entity: EntityKind.Agent,
      entityId: player as string,
      message: `player agent ${player} not found`,
    });
  }

  return problems;
}
