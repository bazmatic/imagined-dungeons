import {
  EntityKind,
  ProblemKind,
  StarterPackEntryKind,
  TriggerEventKind,
} from '@core/domain/builder-kinds';
import type { Problem, TriggerParams, WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';

const TRIGGER_PARAM_VALIDATORS: Record<TriggerEventKind, (p: TriggerParams) => boolean> = {
  [TriggerEventKind.PlayerEnters]: () => true,
  [TriggerEventKind.CombatStarts]: () => true,
  [TriggerEventKind.ItemTaken]: (p) =>
    p.kind === TriggerEventKind.ItemTaken &&
    (p.itemTemplateKey === undefined || typeof p.itemTemplateKey === 'string'),
  [TriggerEventKind.Speech]: (p) =>
    p.kind === TriggerEventKind.Speech && typeof p.phrase === 'string' && p.phrase.length > 0,
  [TriggerEventKind.LlmJudgement]: (p) =>
    p.kind === TriggerEventKind.LlmJudgement &&
    typeof p.predicate === 'string' &&
    p.predicate.length > 0,
};

function isValidTriggerParams(p: TriggerParams): boolean {
  const v = TRIGGER_PARAM_VALIDATORS[p.kind];
  return v ? v(p) : false;
}

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

  // Templates.
  for (const tpl of tree.templates) {
    if (tpl.label.trim().length === 0) {
      problems.push({
        kind: ProblemKind.TemplateLabelEmpty,
        entity: EntityKind.MonsterTemplate,
        entityId: tpl.id as string,
        message: `template ${tpl.id} has empty label`,
      });
    }
    if (tpl.hp <= 0) {
      problems.push({
        kind: ProblemKind.TemplateHpInvalid,
        entity: EntityKind.MonsterTemplate,
        entityId: tpl.id as string,
        message: `template ${tpl.id} hp must be > 0`,
      });
    }
    for (const entry of tpl.startingItems) {
      if (entry.kind === StarterPackEntryKind.Inline && entry.label.trim().length === 0) {
        problems.push({
          kind: ProblemKind.TemplateStartingItemMissing,
          entity: EntityKind.MonsterTemplate,
          entityId: tpl.id as string,
          message: `template ${tpl.id} has a starter-pack entry with empty label`,
        });
      }
    }
  }

  // Triggers.
  const templateIds = new Set(tree.templates.map((t) => t.id as string));
  for (const trg of tree.triggers) {
    if (!templateIds.has(trg.templateId as string)) {
      problems.push({
        kind: ProblemKind.LocationSpawnTriggerTemplateMissing,
        entity: EntityKind.LocationSpawnTrigger,
        entityId: trg.id as string,
        message: `trigger ${trg.id} references missing template ${trg.templateId}`,
      });
    }
    if (!locIds.has(trg.locationId as string)) {
      problems.push({
        kind: ProblemKind.LocationSpawnTriggerLocationMissing,
        entity: EntityKind.LocationSpawnTrigger,
        entityId: trg.id as string,
        message: `trigger ${trg.id} at missing location ${trg.locationId}`,
      });
    }
    if (trg.count < 1) {
      problems.push({
        kind: ProblemKind.LocationSpawnTriggerCountInvalid,
        entity: EntityKind.LocationSpawnTrigger,
        entityId: trg.id as string,
        message: `trigger ${trg.id} count must be >= 1`,
      });
    }
    if (!isValidTriggerParams(trg.params)) {
      problems.push({
        kind: ProblemKind.LocationSpawnTriggerParamsInvalid,
        entity: EntityKind.LocationSpawnTrigger,
        entityId: trg.id as string,
        message: `trigger ${trg.id} params invalid for kind ${trg.params.kind}`,
      });
    }
  }

  // Tag lore: empty tags and duplicates.
  const tagLoreSeen = new Map<string, string>();
  for (const row of tree.tagLore) {
    if (row.tag.trim().length === 0) {
      problems.push({
        kind: ProblemKind.TagLoreTagEmpty,
        entity: EntityKind.TagLore,
        entityId: row.id as string,
        message: `tag-lore row ${row.id} has an empty tag`,
      });
      continue; // don't also report duplicate for empty tags
    }
    const existingId = tagLoreSeen.get(row.tag);
    if (existingId !== undefined) {
      problems.push({
        kind: ProblemKind.TagLoreDuplicate,
        entity: EntityKind.TagLore,
        entityId: row.id as string,
        message: `tag-lore row ${row.id} duplicates tag ${row.tag} (also on ${existingId})`,
      });
    } else {
      tagLoreSeen.set(row.tag, row.id as string);
    }
  }

  return problems;
}
