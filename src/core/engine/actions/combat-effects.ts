import type { Agent } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, LocationId, WorldId } from '@core/domain/ids';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { nextEventId } from '../ids-gen';
import type { HandlerRepo } from '../repository';

export async function applyDeathEffects(
  actorId: AgentId,
  target: Agent,
  locationId: LocationId,
  witnesses: readonly AgentId[],
  worldId: WorldId,
  repo: HandlerRepo,
): Promise<void> {
  const items = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: target.id });
  for (const item of items) {
    await repo.transferItem(item.id, { kind: OwnerKind.Location, id: locationId });
  }
  const deathEvent: DomainEvent = {
    id: nextEventId(),
    worldId,
    actorId,
    kind: EventKind.Death,
    witnesses,
    createdAt: new Date(),
    targetAgentId: target.id,
    locationId,
  };
  await repo.appendEvent(deathEvent);
}
