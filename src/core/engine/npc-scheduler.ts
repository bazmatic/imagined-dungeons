import type { AgentId } from '@core/domain/ids';
import type { Repository } from './repository';

/**
 * NPC activation gate (abstract-design §7).
 *
 * "Not every NPC acts every turn — there's a cheap check (impact heuristic,
 *  proximity, or simple scheduling) to decide who's 'live' this tick."
 *
 * Slice 4 uses **co-location with the player** as the gate plus the
 * `autonomous` flag. NPCs the player can't see or interact with don't act.
 * This satisfies §12's "Bounded model usage per turn" while still letting the
 * world feel alive in the player's immediate vicinity.
 *
 * The result is sorted deterministically (lexicographic by id) and capped at
 * `MAX_NPCS_PER_TICK` so cost and latency are predictable regardless of how
 * many autonomous NPCs share the location.
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
  const here = await repo.agentsAt(player.locationId);
  const eligible = here
    .filter((a) => a.id !== playerId)
    // Always-on (autonomous) OR drawn into the scene by a recent event (awake).
    .filter((a) => a.autonomous || a.awake)
    // hp > 0 — corpses don't tick
    .filter((a) => a.hp > 0)
    .map((a) => a.id)
    .sort();
  return eligible.slice(0, cap);
}
