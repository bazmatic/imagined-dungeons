import type { AgentId, WorldId } from './ids';

/**
 * Structural shape of a campaign's seed data — the locations, exits, items
 * and agents that populate the world on first boot. Auto-generated seed
 * modules (e.g. `src/infra/seed/burning-district.ts`) are assignable to this
 * type; the field set is intentionally a structural superset so a tighter
 * `as const` literal upstream remains compatible.
 */
export interface CampaignSeedData {
  readonly locations: readonly {
    id: string;
    label: string;
    shortDescription: string;
    longDescription: string;
  }[];
  readonly exits: readonly {
    id: string;
    from: string;
    to: string;
    direction: string;
    label: string;
    locked: boolean;
    lockedByItem: string | null;
  }[];
  readonly items: readonly {
    id: string;
    label: string;
    shortDescription: string;
    longDescription: string;
    ownerKind: 'location' | 'agent' | 'item';
    ownerId: string;
    weight: number;
    hidden: boolean;
  }[];
  readonly agents: readonly {
    id: string;
    label: string;
    shortDescription: string;
    longDescription: string;
    locationId: string;
    hp: number;
    damage: number;
    defense: number;
    capacity: number;
    mood: string | null;
    goal: string | null;
    autonomous: boolean;
    // Optional in the seed shape — auto-generated seed modules predate the
    // sideQuest column. New NPCs always start with no side quest.
    sideQuest?: string | null;
  }[];
}

/**
 * A Campaign bundles everything that distinguishes one playable world from
 * another: the seed data, the world's identifier and label, the player
 * agent, and the display name shown in the UI. Adding a new campaign is a
 * drop-in module under `src/campaigns/` plus a one-line change at the
 * composition root.
 */
export interface Campaign {
  /** Stable identifier; becomes the world id in the database. */
  readonly worldId: WorldId;
  /** Display name for the world (e.g. "The Burning District"). */
  readonly worldLabel: string;
  /** Display name for the project + campaign, used in the page title. */
  readonly displayName: string;
  /** Which agent in the seed is the player. */
  readonly playerId: AgentId;
  /** The seed data — locations, exits, items, agents. */
  readonly seed: CampaignSeedData;
}
