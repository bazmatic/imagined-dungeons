import type { BuilderRepository } from '@core/builder/repository';
import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { LocationSpawnTrigger } from '@core/domain/builder-types';
import type { DomainEvent } from '@core/domain/events';
import {
  type AgentId,
  type LocationId,
  type MonsterTemplateId,
  SYSTEM_AGENT_ID,
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

  // Judgement triggers are disjoint from mechanical (their kind is LlmJudgement,
  // which the mechanical dispatcher returns null for), but filter by id for safety.
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

  const out: DomainEvent[] = [];
  let spawnCount = 0;
  const newFireRecords: Record<string, { firedAt: number }> = { ...fireState.byTriggerId };

  for (const hit of allHits) {
    if (spawnCount >= MAX_SPAWNS_PER_TICK) break;
    const remainingBudget = MAX_SPAWNS_PER_TICK - spawnCount;
    const count = Math.min(hit.trigger.count, remainingBudget);
    if (count <= 0) continue;
    const tpl = await args.builderRepo.getMonsterTemplate(args.worldId, hit.trigger.templateId);
    if (!tpl) continue;
    const labels = await generateAgentNames(tpl, count, args.llm);
    const inserts = expandSpawn({ template: tpl, locationId: hit.trigger.locationId, count, labels });
    // Snapshot witnesses BEFORE inserts land so the just-spawned agents don't
    // observe their own arrival.
    const witnessesAtLoc = (await args.engineRepo.agentsAt(hit.trigger.locationId)).map(
      (a) => a.id,
    );
    for (const insert of inserts) {
      await args.builderRepo.upsertAgent(args.worldId, insert);
      out.push(
        spawnedEvent({
          worldId: args.worldId,
          spawnedAgentId: insert.id,
          locationId: hit.trigger.locationId,
          templateId: hit.trigger.templateId,
          ts: now(),
          witnesses: witnessesAtLoc,
        }),
      );
      spawnCount += 1;
      if (spawnCount >= MAX_SPAWNS_PER_TICK) break;
    }
    newFireRecords[hit.trigger.id as string] = { firedAt: now() };
  }

  await args.builderRepo.writeTriggerFireState(args.worldId, { byTriggerId: newFireRecords });
  return { events: out };
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
