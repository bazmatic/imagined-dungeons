import { EntityKind, TriggerEventKind, WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import type {
  AgentId,
  ExitId,
  ItemId,
  LocationId,
  MonsterTemplateId,
  SpawnTriggerId,
  WorldId,
} from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { describe, expect, it } from 'vitest';
import { filterTree } from './filter-tree';

function makeTree(): WorldTree {
  return {
    summary: {
      id: 'w1' as WorldId,
      kind: WorldKind.Draft,
      label: 'world',
      displayName: 'World',
      parentDraftId: null,
      playerAgentId: null,
      coverImageUrl: null,
    },
    locations: [
      {
        id: 'loc-tavern' as LocationId,
        worldId: 'w1' as WorldId,
        label: 'The Drunken Goblin',
        shortDescription: '',
        longDescription: '',
        tags: [],
        secretDescription: '',
      },
      {
        id: 'loc-cave' as LocationId,
        worldId: 'w1' as WorldId,
        label: 'Dark Cave',
        shortDescription: '',
        longDescription: '',
        tags: [],
        secretDescription: '',
      },
    ],
    exits: [
      {
        id: 'exit-1' as ExitId,
        worldId: 'w1' as WorldId,
        from: 'loc-tavern' as LocationId,
        to: 'loc-cave' as LocationId,
        direction: 'north',
        label: 'tunnel to the cave',
        locked: false,
        lockedByItem: null,
      },
    ],
    items: [
      {
        id: 'item-key' as ItemId,
        worldId: 'w1' as WorldId,
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
        weaponDamage: null,
        armorDefense: null,
      },
    ],
    agents: [
      {
        id: 'agent-barkeep' as AgentId,
        worldId: 'w1' as WorldId,
        label: 'Goblin Barkeep',
        shortDescription: '',
        longDescription: '',
        locationId: 'loc-tavern' as LocationId,
        hp: 10,
        damage: 1,
        defense: 0,
        capacity: 10,
        mood: null,
        shortTermIntent: null,
        goal: null,
        autonomous: false,
        awake: false,
        gold: 0,
        tags: [],
        secretDescription: '',
      },
    ],
    templates: [
      {
        id: 'tpl-goblin' as MonsterTemplateId,
        worldId: 'w1' as WorldId,
        templateKey: 'goblin',
        label: 'Wild Goblin',
        shortDescription: '',
        longDescription: '',
        hpMin: 5,
        hpMax: 5,
        damageMin: 1,
        damageMax: 1,
        defenseMin: 0,
        defenseMax: 0,
        labelPrefixInstructions: null,
        mood: null,
        startingItems: [],
        tags: [],
      },
    ],
    triggers: [
      {
        id: 'trg-1' as SpawnTriggerId,
        worldId: 'w1' as WorldId,
        locationId: 'loc-cave' as LocationId,
        templateId: 'tpl-goblin' as MonsterTemplateId,
        params: { kind: TriggerEventKind.PlayerEnters },
        count: 1,
        oneShot: true,
        fireOnInitialPublish: false,
      },
    ],
    worldLore: { worldId: 'w1' as WorldId, worldOverview: '', storySoFar: '' },
    tagLore: [],
  };
}

describe('filterTree', () => {
  it('returns empty array for empty query', () => {
    expect(filterTree(makeTree(), '')).toEqual([]);
  });

  it('matches across entity kinds case-insensitively', () => {
    const results = filterTree(makeTree(), 'goblin');
    const labels = results.map((r) => r.label);
    expect(labels).toContain('The Drunken Goblin');
    expect(labels).toContain('Goblin Barkeep');
    expect(labels).toContain('Wild Goblin');
  });

  it('matches by id', () => {
    const results = filterTree(makeTree(), 'loc-cave');
    expect(results.some((r) => r.id === 'loc-cave')).toBe(true);
  });

  it('caps at 50 results', () => {
    const tree = makeTree();
    const many = Array.from({ length: 200 }, (_, i) => ({
      id: `loc-${i}` as LocationId,
      worldId: 'w1' as WorldId,
      label: `Place ${i}`,
      shortDescription: '',
      longDescription: '',
      tags: [] as readonly string[],
      secretDescription: '',
    }));
    const big: WorldTree = { ...tree, locations: many };
    expect(filterTree(big, 'place').length).toBe(50);
  });

  it('tags each result with its entity kind', () => {
    const results = filterTree(makeTree(), 'brass key');
    expect(results[0]?.kind).toBe(EntityKind.Item);
  });
});
