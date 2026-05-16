import type { AgentId, LocationId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import type { HandlerRepo } from './repository';

// Scans the last N *events* (not turns) for an attack involving the player.
// In a busy tick many events fire, so this window may span only a few turns.
const RECENT_EVENT_WINDOW = 100;

export async function isPlayerInCombat(
  playerId: AgentId,
  locationId: LocationId,
  repo: HandlerRepo,
): Promise<boolean> {
  const here = await repo.agentsAt(locationId);
  const livingAwakeEnemyIds = new Set(
    here.filter((a) => a.id !== playerId && a.hp > 0 && a.awake).map((a) => a.id),
  );
  if (livingAwakeEnemyIds.size === 0) return false;
  const recent = await repo.recentEvents(RECENT_EVENT_WINDOW);
  return recent.some((e) => {
    if (e.kind !== EventKind.Attack) return false;
    const playerIsActor = e.actorId === playerId;
    const playerIsTarget = e.targetAgentId === playerId;
    if (!playerIsActor && !playerIsTarget) return false;
    const enemyId = playerIsActor ? e.targetAgentId : e.actorId;
    return livingAwakeEnemyIds.has(enemyId);
  });
}
