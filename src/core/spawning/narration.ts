import type { DomainEvent } from '@core/domain/events';
import type { AgentId, LocationId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import type { JsonSchema, LanguageModel } from '@core/engine/language-model';
import type { Repository } from '@core/engine/repository';

const NARRATION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { narration: { type: 'string' } },
  required: ['narration'],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  'You are a dungeon master narrating a tabletop RPG. Write a vivid, present-tense description of these creatures arriving in this location. Two to three sentences. Do not reference game mechanics or stats. Use the exact number of creatures listed — do not imply more or fewer.';

export async function generateSpawnNarration(args: {
  readonly spawnEvents: readonly DomainEvent[];
  readonly playerId: AgentId;
  readonly repo: Repository;
  readonly llm: LanguageModel | null;
}): Promise<readonly string[]> {
  const { spawnEvents, playerId, repo, llm } = args;
  if (!llm) return [];

  // Group AgentSpawned events by location, keeping only those the player witnessed
  const byLocation = new Map<LocationId, Array<{ spawnedAgentId: AgentId }>>();
  for (const ev of spawnEvents) {
    if (ev.kind !== EventKind.AgentSpawned) continue;
    if (!ev.witnesses.some((w) => w === playerId)) continue;
    const group = byLocation.get(ev.locationId) ?? [];
    group.push({ spawnedAgentId: ev.spawnedAgentId });
    byLocation.set(ev.locationId, group);
  }
  if (byLocation.size === 0) return [];

  const narrations: string[] = [];
  for (const [locationId, entries] of byLocation) {
    try {
      const location = await repo.getLocation(locationId);
      const agents = await Promise.all(entries.map((e) => repo.getAgent(e.spawnedAgentId)));
      const creatureHeader =
        agents.length === 1 ? '1 creature arriving:' : `${agents.length} creatures arriving:`;
      const user = [
        `Location: ${location.label}`,
        location.shortDescription,
        location.longDescription,
        '',
        creatureHeader,
        ...agents.map((a) => `- ${a.label}: ${a.shortDescription}\n  ${a.longDescription}`),
      ].join('\n');
      const response = await llm.complete({
        system: SYSTEM_PROMPT,
        user,
        schema: NARRATION_SCHEMA,
        schemaName: 'SpawnNarration',
      });
      const parsed = response.parsed as { narration?: string };
      if (parsed?.narration) narrations.push(parsed.narration);
    } catch {
      // Skip narration on LLM error; player still sees "X appeared" from the event
    }
  }
  return narrations;
}
