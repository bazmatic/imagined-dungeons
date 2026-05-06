import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import type { AgentId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import type { Repository } from './repository';

export interface PerceptionView {
  readonly actor: Agent;
  readonly location: Location;
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly exits: readonly Exit[];
}

export async function perceive(actorId: AgentId, repo: Repository): Promise<PerceptionView> {
  const actor = await repo.getAgent(actorId);
  const location = await repo.getLocation(actor.locationId);
  const itemsHere = await repo.itemsOwnedBy({ kind: OwnerKind.Location, id: location.id });
  const items = itemsHere.filter((i) => !i.hidden);
  const agentsHere = await repo.agentsAt(location.id);
  const agents = agentsHere.filter((a) => a.id !== actorId);
  const exits = await repo.exitsFrom(location.id);
  return { actor, location, items, agents, exits };
}
