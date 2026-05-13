import type { Agent, Item, Location } from '@core/domain/entities';
import type { AgentId, ItemId, LocationId, WorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  isCategory,
  parseSearchParams,
  resolveOwnerSubtitle,
} from './category-helpers';

describe('CATEGORIES', () => {
  it('exposes exactly the five supported categories', () => {
    expect(CATEGORIES).toEqual(['locations', 'bestiary', 'agents', 'items', 'lore']);
  });
});

describe('isCategory', () => {
  it('accepts known values', () => {
    expect(isCategory('locations')).toBe(true);
    expect(isCategory('bestiary')).toBe(true);
    expect(isCategory('agents')).toBe(true);
    expect(isCategory('items')).toBe(true);
    expect(isCategory('lore')).toBe(true);
  });
  it('rejects unknown values', () => {
    expect(isCategory('nonsense')).toBe(false);
    expect(isCategory('')).toBe(false);
    expect(isCategory(undefined)).toBe(false);
  });
});

describe('parseSearchParams', () => {
  it('defaults cat to locations and sel/view to undefined', () => {
    expect(parseSearchParams({})).toEqual({ cat: 'locations' });
  });
  it('preserves valid params', () => {
    expect(parseSearchParams({ cat: 'agents', sel: 'agent-1', view: 'settings' })).toEqual({
      cat: 'agents',
      sel: 'agent-1',
      view: 'settings',
    });
  });
  it('drops invalid cat (falls back to locations)', () => {
    expect(parseSearchParams({ cat: 'nonsense' })).toEqual({ cat: 'locations' });
  });
  it('drops invalid view', () => {
    expect(parseSearchParams({ view: 'nonsense' })).toEqual({ cat: 'locations' });
  });
});

describe('resolveOwnerSubtitle', () => {
  const locations: readonly Location[] = [
    {
      id: 'loc-tavern' as LocationId,
      worldId: 'w' as WorldId,
      label: 'The Tavern',
      shortDescription: '',
      longDescription: '',
      tags: [],
      secretDescription: '',
    },
  ];
  const agents: readonly Agent[] = [
    {
      id: 'agent-barkeep' as AgentId,
      worldId: 'w' as WorldId,
      label: 'Barkeep',
      shortDescription: '',
      longDescription: '',
      locationId: 'loc-tavern' as LocationId,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 10,
      mood: null,
      goal: null,
      autonomous: false,
      shortTermIntent: null,
      awake: false,
      gold: 0,
      tags: [],
      secretDescription: '',
    },
  ];
  const items: readonly Item[] = [
    {
      id: 'item-key' as ItemId,
      worldId: 'w' as WorldId,
      label: 'Brass Key',
      shortDescription: '',
      longDescription: '',
      owner: { kind: OwnerKind.Location, id: 'loc-tavern' as LocationId },
      weight: 1,
      hidden: false,
      tags: [],
      equipped: false,
      container: false,
      opened: true,
      locked: false,
      lockedByItem: null,
      priceTag: null,
    },
  ];

  it('formats a location owner', () => {
    const item = items[0];
    if (!item) throw new Error('fixture missing');
    expect(resolveOwnerSubtitle(item, locations, agents, items)).toBe('in The Tavern');
  });

  it('formats an agent owner', () => {
    const item: Item = {
      ...(items[0] as Item),
      owner: { kind: OwnerKind.Agent, id: 'agent-barkeep' as AgentId },
    };
    expect(resolveOwnerSubtitle(item, locations, agents, items)).toBe('carried by Barkeep');
  });

  it('formats a nested-item owner', () => {
    const parent: Item = {
      ...(items[0] as Item),
      id: 'item-pouch' as ItemId,
      label: 'Leather Pouch',
    };
    const nested: Item = {
      ...(items[0] as Item),
      owner: { kind: OwnerKind.Item, id: 'item-pouch' as ItemId },
    };
    expect(resolveOwnerSubtitle(nested, locations, agents, [...items, parent])).toBe(
      'inside Leather Pouch',
    );
  });

  it('falls back to the id when the owner is missing', () => {
    const orphan: Item = {
      ...(items[0] as Item),
      owner: { kind: OwnerKind.Location, id: 'loc-missing' as LocationId },
    };
    expect(resolveOwnerSubtitle(orphan, locations, agents, items)).toBe('in loc-missing');
  });
});
