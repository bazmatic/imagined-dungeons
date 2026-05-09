declare const Brand: unique symbol;
type Branded<T, B> = T & { readonly [Brand]: B };

export type LocationId = Branded<string, 'LocationId'>;
export type ItemId = Branded<string, 'ItemId'>;
export type AgentId = Branded<string, 'AgentId'>;
export type ExitId = Branded<string, 'ExitId'>;
export type EventId = Branded<string, 'EventId'>;
export type WorldId = Branded<string, 'WorldId'>;
export type MonsterTemplateId = Branded<string, 'MonsterTemplateId'>;
export type SpawnTriggerId = Branded<string, 'SpawnTriggerId'>;

export const asLocationId = (s: string): LocationId => s as LocationId;
export const asItemId = (s: string): ItemId => s as ItemId;
export const asAgentId = (s: string): AgentId => s as AgentId;
export const asExitId = (s: string): ExitId => s as ExitId;
export const asEventId = (s: string): EventId => s as EventId;
export const asWorldId = (s: string): WorldId => s as WorldId;
export const asMonsterTemplateId = (s: string): MonsterTemplateId => s as MonsterTemplateId;
export const asSpawnTriggerId = (s: string): SpawnTriggerId => s as SpawnTriggerId;

/**
 * The synthetic "system" agent — used as the actorId on actions and events
 * issued by "the world" (notably the consequence engine; abstract-design §4,
 * §10). The agent is non-autonomous and is filtered out by the NPC scheduler.
 */
export const SYSTEM_AGENT_ID: AgentId = asAgentId('system');
