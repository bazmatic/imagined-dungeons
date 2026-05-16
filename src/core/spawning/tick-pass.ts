import type { BuilderRepository } from '@core/builder/repository';
import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { LocationSpawnTrigger, MonsterTemplate, TriggerFireState, UpsertAgentInput, UpsertItemInput } from '@core/domain/builder-types';
import type { DomainEvent } from '@core/domain/events';
import {
  type AgentId,
  type LocationId,
  type MonsterTemplateId,
  SYSTEM_AGENT_ID,
  type SpawnTriggerId,
  type WorldId,
  asEventId,
} from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import type { LanguageModel } from '@core/engine/language-model';
import type { Repository } from '@core/engine/repository';
import { expandSpawn } from './expand';
import { generateAgentNames } from './generate-names';
import { MAX_JUDGEMENT_CALLS_PER_TICK, MAX_SPAWNS_PER_TICK } from './limits';
import {
  type PerceptionView,
  type TriggerHit,
  matchJudgementTriggers,
  matchMechanicalTriggers,
} from './triggers';

export interface TickSpawnResult {
  readonly events: readonly DomainEvent[];
}

export interface SpawnBatch {
  readonly agents: readonly UpsertAgentInput[];
  readonly items: readonly UpsertItemInput[];
  readonly triggerFires: ReadonlyMap<SpawnTriggerId, { firedAt: number }>;
  readonly events: readonly DomainEvent[];
}

export interface PlanSpawnArgs {
  readonly worldId: WorldId;
  readonly hits: readonly TriggerHit[];
  readonly fetchTemplate: (id: MonsterTemplateId) => Promise<MonsterTemplate | null>;
  readonly fetchWitnesses: (locationId: LocationId) => Promise<readonly AgentId[]>;
  readonly generateNames: (template: MonsterTemplate, count: number) => Promise<readonly string[]>;
  readonly now?: () => number;
}

/** Pure planning phase: all decisions, no repo writes. */
export async function planSpawnBatch(args: PlanSpawnArgs): Promise<SpawnBatch> {
  const now = args.now ?? (() => Date.now());
  const agents: UpsertAgentInput[] = [];
  const items: UpsertItemInput[] = [];
  const triggerFires = new Map<SpawnTriggerId, { firedAt: number }>();
  const events: DomainEvent[] = [];
  let spawnCount = 0;

  for (const hit of args.hits) {
    if (spawnCount >= MAX_SPAWNS_PER_TICK) break;
    const remainingBudget = MAX_SPAWNS_PER_TICK - spawnCount;
    const count = Math.min(hit.trigger.count, remainingBudget);
    if (count <= 0) continue;
    const tpl = await args.fetchTemplate(hit.trigger.templateId);
    if (!tpl) continue;
    const labels = await args.generateNames(tpl, count);
    const inserts = expandSpawn({ template: tpl, locationId: hit.trigger.locationId, count, labels });
    // Snapshot witnesses before any inserts so spawned agents don't witness their own arrival.
    const witnesses = await args.fetchWitnesses(hit.trigger.locationId);
    for (const insert of inserts.agents) {
      agents.push(insert);
      events.push(spawnedEvent({
        worldId: args.worldId,
        spawnedAgentId: insert.id,
        locationId: hit.trigger.locationId,
        templateId: hit.trigger.templateId,
        ts: now(),
        witnesses,
      }));
      spawnCount++;
      if (spawnCount >= MAX_SPAWNS_PER_TICK) break;
    }
    for (const item of inserts.items) {
      items.push(item);
    }
    triggerFires.set(hit.trigger.id, { firedAt: now() });
  }

  return { agents, items, triggerFires, events };
}

export interface ExecuteSpawnArgs {
  readonly worldId: WorldId;
  readonly builderRepo: BuilderRepository;
  readonly previousFireState: TriggerFireState;
}

/** Execution phase: all writes. Agents first, then items, then fire-state in one call. */
export async function executeSpawnPlan(batch: SpawnBatch, args: ExecuteSpawnArgs): Promise<void> {
  for (const agent of batch.agents) {
    await args.builderRepo.upsertAgent(args.worldId, agent);
  }
  for (const item of batch.items) {
    await args.builderRepo.upsertItem(args.worldId, item);
  }
  if (batch.triggerFires.size > 0) {
    const newFireRecords: Record<string, { firedAt: number }> = { ...args.previousFireState.byTriggerId };
    for (const [triggerId, record] of batch.triggerFires) {
      newFireRecords[triggerId as string] = record;
    }
    await args.builderRepo.writeTriggerFireState(args.worldId, { byTriggerId: newFireRecords });
  }
}

/**
 * Tick-time spawn orchestration. Runs the mechanical pass, then the
 * judgement pass over remaining `LlmJudgement` triggers, applies inserts
 * via the builder repo (which is the only port with an agent-insert path),
 * caps at `MAX_SPAWNS_PER_TICK`, and emits one `AgentSpawned` domain event
 * per inserted agent. Witnesses on each spawn event include the agents
 * already present at the destination location at the moment of the
 * insert.
 *
 * Live-world agent inserts go through the *builder* port, not the engine
 * port, because the engine port is read-mostly by design. The builder
 * port permits writes; the facade gate (`requireDraft`) is an
 * authoring-side check only — runtime spawning bypasses it intentionally.
 */
export async function runSpawnTickPass(args: {
  readonly worldId: WorldId;
  readonly events: readonly DomainEvent[];
  readonly engineRepo: Repository;
  readonly builderRepo: BuilderRepository;
  readonly llm: LanguageModel | null;
  readonly perception: PerceptionView;
  readonly now?: () => number;
}): Promise<TickSpawnResult> {
  const now = args.now ?? (() => Date.now());
  const triggers = await args.builderRepo.listLocationSpawnTriggers(args.worldId);
  if (triggers.length === 0) return { events: [] };

  const fireState = await args.builderRepo.readTriggerFireState(args.worldId);

  const mechHits = matchMechanicalTriggers({
    events: args.events,
    triggers,
    fireState,
    perception: args.perception,
  });

  const judgementCandidates = triggers.filter(
    (t: LocationSpawnTrigger) =>
      t.params.kind === TriggerEventKind.LlmJudgement &&
      !mechHits.some((h) => h.trigger.id === t.id),
  );
  const { hits: judgeHits } = await matchJudgementTriggers({
    events: args.events,
    triggers: judgementCandidates,
    fireState,
    perception: args.perception,
    llm: args.llm,
    judgementBudget: MAX_JUDGEMENT_CALLS_PER_TICK,
  });

  const allHits: TriggerHit[] = [...mechHits, ...judgeHits];
  if (allHits.length === 0) return { events: [] };

  const batch = await planSpawnBatch({
    worldId: args.worldId,
    hits: allHits,
    fetchTemplate: (id) => args.builderRepo.getMonsterTemplate(args.worldId, id),
    fetchWitnesses: (locationId) => args.engineRepo.agentsAt(locationId).then((agents) => agents.map((a) => a.id)),
    generateNames: (tpl, count) => generateAgentNames(tpl, count, args.llm),
    now,
  });

  await executeSpawnPlan(batch, {
    worldId: args.worldId,
    builderRepo: args.builderRepo,
    previousFireState: fireState,
  });

  return { events: batch.events };
}

function spawnedEvent(args: {
  readonly worldId: WorldId;
  readonly spawnedAgentId: AgentId;
  readonly locationId: LocationId;
  readonly templateId: MonsterTemplateId;
  readonly ts: number;
  readonly witnesses: readonly AgentId[];
}): DomainEvent {
  return {
    id: asEventId(`evt_spawn_${args.ts}_${(args.spawnedAgentId as string).slice(-6)}`),
    worldId: args.worldId,
    actorId: SYSTEM_AGENT_ID,
    kind: EventKind.AgentSpawned,
    witnesses: args.witnesses,
    createdAt: new Date(args.ts),
    spawnedAgentId: args.spawnedAgentId,
    locationId: args.locationId,
    templateId: args.templateId,
  };
}
