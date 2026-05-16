import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import type { HandlerRepo } from './repository';

/**
 * Per-agent memory recall (abstract-design §8).
 *
 * An agent's memory is a perception-gated, ordered slice of the global event
 * log. An event enters an agent's memory only if the agent could perceive it:
 * they were the actor or appear in `event.witnesses`. The append-only event
 * log is the source of truth — memory is just a filtered view.
 *
 * Both the Narrator and the NPC mind read context through this entry point so
 * that "what does this character know" has exactly one definition.
 *
 * Note: `recentEvents(limit)` is sampled with extra headroom (`limit * 4`)
 * because the filter may discard a large fraction of recent events for any
 * given observer; the final return is bounded by `limit`.
 */
export async function recallFor(
  actorId: AgentId,
  repo: HandlerRepo,
  limit: number,
): Promise<readonly DomainEvent[]> {
  if (limit <= 0) return [];
  // Pull a wider window so the filter has enough candidates to reach `limit`.
  // The repository slices in chronological order; we then keep the most recent
  // `limit` matches.
  const window = await repo.recentEvents(Math.max(limit * 4, limit));
  const matches = window.filter(
    (e) => e.actorId === actorId || e.witnesses.some((w) => w === actorId),
  );
  return matches.slice(-limit);
}
