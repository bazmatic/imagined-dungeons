import type { AgentId } from '@core/domain/ids';
import { SYSTEM_AGENT_ID } from '@core/domain/ids';
import type { Repository } from './repository';

/**
 * NPC activation gate (abstract-design §7).
 *
 * Any not-asleep agent ticks regardless of where they are in the world.
 * "Not asleep" means `autonomous || awake`. Co-location with the player is
 * NOT a gate — an NPC pursuing an intent in another room (Spark moving to
 * the docks while the player stays in the tavern) needs to keep ticking or
 * their plan never advances.
 *
 * Boundedness (§12) is preserved by the per-tick cap: at most
 * `MAX_NPCS_PER_TICK` agents tick per player turn. When more are eligible
 * than the cap allows, co-located ones are preferred (the player should see
 * the NPCs in their immediate vicinity move first); among ties, lexicographic
 * id order is used for determinism.
 */

/** Hard cap on NPC mind invocations per player turn. */
export const MAX_NPCS_PER_TICK = 2;

export interface ScheduleNpcsArgs {
  readonly playerId: AgentId;
  readonly repo: Repository;
  readonly cap?: number;
}

export async function scheduleNpcs(args: ScheduleNpcsArgs): Promise<readonly AgentId[]> {
  const { playerId, repo } = args;
  const cap = args.cap ?? MAX_NPCS_PER_TICK;
  const player = await repo.getAgent(playerId);
  const all = await repo.allAgents();
  const eligible = all
    .filter((a) => a.id !== playerId)
    .filter((a) => a.id !== SYSTEM_AGENT_ID)
    // Always-on (autonomous) OR drawn into the scene by a recent event (awake).
    .filter((a) => a.autonomous || a.awake)
    // hp > 0 — corpses don't tick
    .filter((a) => a.hp > 0);
  // Prefer co-located NPCs first (visible to the player) so a lively scene
  // gets ticked under tight caps; offstage agents take whatever cap remains.
  const sorted = [...eligible].sort((a, b) => {
    const aHere = a.locationId === player.locationId ? 0 : 1;
    const bHere = b.locationId === player.locationId ? 0 : 1;
    if (aHere !== bHere) return aHere - bHere;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted.slice(0, cap).map((a) => a.id);
}
