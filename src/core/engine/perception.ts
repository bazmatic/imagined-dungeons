import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { type AgentId, type ItemId, SYSTEM_AGENT_ID } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import type { Repository } from './repository';

export interface PerceptionView {
  readonly actor: Agent;
  readonly location: Location;
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly exits: readonly Exit[];
}

/**
 * Walk an item's owner-chain upward. If the chain passes through any
 * container item with `opened=false`, the candidate item is unreachable
 * from perception. Walk terminates as soon as we leave the item layer
 * (owner becomes a location or an agent).
 */
function isReachable(item: Item, byId: ReadonlyMap<ItemId, Item>): boolean {
  let cursor: Item | undefined = item;
  while (cursor && cursor.owner.kind === OwnerKind.Item) {
    const parent = byId.get(cursor.owner.id);
    if (!parent) return false; // dangling owner — drop
    if (parent.container && !parent.opened) return false;
    cursor = parent;
  }
  return true;
}

export async function perceive(actorId: AgentId, repo: Repository): Promise<PerceptionView> {
  const actor = await repo.getAgent(actorId);
  const location = await repo.getLocation(actor.locationId);
  // Collect every item reachable from the location: items directly owned by
  // the location, plus items transitively owned by those items. Build a map
  // for the chain-walk filter.
  const direct = await repo.itemsOwnedBy({ kind: OwnerKind.Location, id: location.id });
  const collected = new Map<ItemId, Item>();
  const stack: Item[] = [...direct];
  while (stack.length > 0) {
    const it = stack.pop();
    if (!it || collected.has(it.id)) continue;
    collected.set(it.id, it);
    const children = await repo.itemsOwnedBy({ kind: OwnerKind.Item, id: it.id });
    for (const c of children) stack.push(c);
  }
  const items = [...collected.values()].filter(
    (i) => !i.hidden && isReachable(i, collected),
  );
  const agentsHere = await repo.agentsAt(location.id);
  // Filter out the actor themselves and the synthetic `system` agent — the
  // latter is "the world" and never visible to characters in the fiction.
  const agents = agentsHere.filter((a) => a.id !== actorId && a.id !== SYSTEM_AGENT_ID);
  const exits = await repo.exitsFrom(location.id);
  return { actor, location, items, agents, exits };
}
