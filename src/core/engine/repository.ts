import type { Agent, Exit, Item, Location, Owner } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, ExitId, ItemId, LocationId, WorldId } from '@core/domain/ids';

/**
 * Narrow interface for action handlers and the perception layer.
 * Contains every method handlers actually call; excludes scheduler-only
 * methods (`allAgents`, `recentEvents`) so handlers are not forced to
 * depend on the full god interface.
 */
export interface HandlerRepo {
  getWorldId(): Promise<WorldId>;
  getAgent(id: AgentId): Promise<Agent>;
  getLocation(id: LocationId): Promise<Location>;
  getItem(id: ItemId): Promise<Item>;
  getExit(id: ExitId): Promise<Exit>;
  itemsOwnedBy(owner: Owner): Promise<readonly Item[]>;
  agentsAt(loc: LocationId): Promise<readonly Agent[]>;
  exitsFrom(loc: LocationId): Promise<readonly Exit[]>;
  moveAgent(agent: AgentId, to: LocationId): Promise<void>;
  transferItem(item: ItemId, to: Owner): Promise<void>;
  /**
   * Runtime equip toggle. Pure data flip — narration is the action handler's
   * job (it emits an Equip/Unequip event with a `manner` phrase). Engine
   * doesn't enforce slot conflicts in v1; any number of items on an agent
   * may be equipped.
   */
  setItemEquipped(item: ItemId, equipped: boolean): Promise<void>;
  /**
   * Runtime visibility toggle. Authors mark some items `hidden: true` so the
   * player doesn't see them in perceive() — the player has to search,
   * disturb something, or otherwise be made aware. This flag is flipped by
   * the search handler when discovery matches a hidden item, and by the
   * consequence engine's `reveal_item` action.
   */
  setItemHidden(item: ItemId, hidden: boolean): Promise<void>;
  /**
   * Runtime container open/close toggle. Pure data flip; narration is the
   * action handler's job (Open/Close handlers emit the corresponding events).
   */
  setItemOpened(item: ItemId, opened: boolean): Promise<void>;
  /**
   * Runtime container lock toggle. The Open handler clears this flag when
   * the actor produces the matching key item (`lockedByItem`).
   */
  setItemLocked(item: ItemId, locked: boolean): Promise<void>;
  /**
   * Runtime exit lock toggle. handleMove clears this when the actor enters
   * carrying the matching key item (`Exit.lockedByItem`).
   */
  setExitLocked(exit: ExitId, locked: boolean): Promise<void>;
  /**
   * Set an agent's gold balance. Authored via the builder; mutated at
   * runtime inside the buy/sell trade flow.
   */
  setAgentGold(id: AgentId, gold: number): Promise<void>;
  /**
   * Clear or set an item's price tag. `offer` sets it to a positive integer;
   * a completed Trade clears it to null.
   */
  setItemPriceTag(item: ItemId, priceTag: number | null): Promise<void>;
  setAgentHp(id: AgentId, hp: number): Promise<void>;
  /**
   * Toggle the runtime "in the scene" flag. The scheduler ticks any agent
   * that is `autonomous || awake`. The engine wakes an agent when something
   * draws their attention (interaction, threat, vocative) and sleeps them
   * once their `sideQuest` is null again.
   */
  setAgentAwake(id: AgentId, awake: boolean): Promise<void>;
  appendEvent(event: DomainEvent): Promise<void>;
  /** Read the current world RNG seed. */
  getRngSeed(): Promise<number>;
  /** Persist a new RNG seed for the world (after one or more rolls). */
  setRngSeed(seed: number): Promise<void>;
  /**
   * Description-update primitives used by the consequence engine. A field
   * passed as `undefined` (i.e. omitted) MUST be left untouched. `null` is
   * not a meaningful patch value — the action's `null` is filtered to
   * "omit" by the handler before it reaches the repository.
   */
  updateLocationDescription(
    id: LocationId,
    patch: { short?: string; long?: string },
  ): Promise<void>;
  updateItemDescription(id: ItemId, patch: { short?: string; long?: string }): Promise<void>;
  /**
   * Agent description/state updates. Field convention (consistent across the
   * repo layer):
   *   - field is `undefined` (omitted) → leave that column untouched;
   *   - field is `null` → write SQL NULL (clear the column);
   *   - field is a string → write the string.
   *
   * The action handler translates the action's "null means unchanged"
   * convention into the repo's "undefined means unchanged" convention.
   */
  updateAgentDescription(
    id: AgentId,
    patch: {
      short?: string;
      long?: string;
      mood?: string | null;
      sideQuest?: string | null;
    },
  ): Promise<void>;
  /**
   * Scan recent events — used by combat detection (move handler) and NPC
   * memory. Included in HandlerRepo because action handlers legitimately
   * need it; the scheduler also uses it indirectly.
   */
  recentEvents(limit: number): Promise<readonly DomainEvent[]>;
  recordEntityTrace(
    entityKind: 'location' | 'agent' | 'item',
    entityId: string,
    effect: string,
  ): Promise<void>;
  getEntityTraces(
    entityKind: 'location' | 'agent' | 'item',
    entityId: string,
    limit: number,
  ): Promise<readonly string[]>;
}

/** Full repository contract. Extends HandlerRepo with scheduler-only methods. */
export interface Repository extends HandlerRepo {
  /** Every agent in the world (used by the scheduler to tick offstage NPCs). */
  allAgents(): Promise<readonly Agent[]>;
  /**
   * Atomically increments the world tick counter, stores the new value
   * internally for use by appendEvent, and returns it.
   * Must be called once at the start of each runTick before any appendEvent calls.
   */
  incrementTickCount(): Promise<number>;
}
