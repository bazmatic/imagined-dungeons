import { StarterPackEntryKind } from '@core/domain/builder-kinds';
import type { MonsterTemplate } from '@core/domain/builder-types';
import { asLocationId, asMonsterTemplateId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { describe, expect, it } from 'vitest';
import { expandSpawn } from './expand';

const W = asWorldId('w_live');
const tpl: MonsterTemplate = {
  id: asMonsterTemplateId('tpl_goblin'),
  worldId: W,
  templateKey: 'goblin',
  label: 'goblin',
  labelPrefixInstructions: null,
  shortDescription: 'a goblin',
  longDescription: 'a small goblin',
  hpMin: 3,
  hpMax: 5,
  damageMin: 2,
  damageMax: 4,
  defenseMin: 0,
  defenseMax: 1,
  mood: 'wary',
  startingItems: [],
  tags: [],
};

describe('expandSpawn', () => {
  it('produces count agent inserts at the given location', () => {
    const result = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3 });
    expect(result.agents).toHaveLength(3);
    for (const a of result.agents) {
      expect(a.locationId).toBe(asLocationId('loc_a'));
      expect(a.label).toBe('goblin');
      expect(a.hp).toBeGreaterThanOrEqual(tpl.hpMin);
      expect(a.hp).toBeLessThanOrEqual(tpl.hpMax);
      expect(a.mood).toBe('wary');
    }
  });

  it('mints unique ids per call', () => {
    const result = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 4 });
    const ids = new Set(result.agents.map((a) => a.id as string));
    expect(ids.size).toBe(4);
  });

  it('copies template.tags onto the spawned agent insert', () => {
    const tagged: MonsterTemplate = { ...tpl, tags: ['goblin', 'cult'] };
    const result = expandSpawn({ template: tagged, locationId: asLocationId('loc_a'), count: 1 });
    expect(result.agents).toHaveLength(1);
    const [first] = result.agents;
    if (!first) throw new Error('expected one insert');
    expect(first.tags).toEqual(['goblin', 'cult']);
  });

  it('uses provided labels array instead of template.label', () => {
    const labels = ['[Tall] goblin', '[Short] goblin', '[Old] goblin'];
    const result = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3, labels });
    expect(result.agents.map((a) => a.label)).toEqual(labels);
  });

  it('falls back to template.label when labels array is shorter than count', () => {
    const labels = ['[Tall] goblin'];
    const result = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3, labels });
    expect(result.agents[0]?.label).toBe('[Tall] goblin');
    expect(result.agents[1]?.label).toBe('goblin');
    expect(result.agents[2]?.label).toBe('goblin');
  });

  it('rolls hp within hpMin/hpMax range', () => {
    const fixedTpl: MonsterTemplate = { ...tpl, hpMin: 5, hpMax: 5 };
    const result = expandSpawn({ template: fixedTpl, locationId: asLocationId('loc_a'), count: 5 });
    for (const a of result.agents) {
      expect(a.hp).toBe(5);
    }
  });
});

const W2 = asWorldId('w');
const LOC = asLocationId('loc_a');

const baseTpl = (): MonsterTemplate => ({
  id: asMonsterTemplateId('tpl_1'),
  worldId: W2,
  templateKey: 'goblin',
  label: 'Goblin',
  labelPrefixInstructions: null,
  shortDescription: 'A goblin.',
  longDescription: 'A small, green creature.',
  hpMin: 5,
  hpMax: 5,
  damageMin: 2,
  damageMax: 2,
  defenseMin: 1,
  defenseMax: 1,
  mood: null,
  startingItems: [],
  tags: [],
});

describe('expandSpawn — startingItems', () => {
  it('returns no items when startingItems is empty', () => {
    const result = expandSpawn({ template: baseTpl(), locationId: LOC, count: 1 });
    expect(result.items).toHaveLength(0);
    expect(result.agents).toHaveLength(1);
  });

  it('creates a starting item owned by the spawned agent', () => {
    const tpl2 = baseTpl();
    (tpl2.startingItems as unknown as unknown[]).push({
      kind: StarterPackEntryKind.Inline,
      label: 'rusty sword',
      shortDescription: 'A rusty sword.',
      longDescription: 'A badly maintained blade.',
      weight: 2,
      hidden: false,
      weaponDamage: 4,
      armorDefense: null,
      equipped: true,
    });
    const result = expandSpawn({ template: tpl2, locationId: LOC, count: 1 });
    expect(result.agents).toHaveLength(1);
    expect(result.items).toHaveLength(1);
    const agent = result.agents[0];
    const item = result.items[0];
    expect(item?.ownerKind).toBe(OwnerKind.Agent);
    expect(item?.ownerId).toBe(agent?.id);
    expect(item?.label).toBe('rusty sword');
    expect(item?.weaponDamage).toBe(4);
    expect(item?.equipped).toBe(true);
  });

  it('generates one item per starting item per spawned agent', () => {
    const tpl3 = { ...baseTpl() };
    const items = [
      { kind: StarterPackEntryKind.Inline, label: 'sword', shortDescription: '', longDescription: '', weight: 2, hidden: false, weaponDamage: 4, armorDefense: null, equipped: true },
      { kind: StarterPackEntryKind.Inline, label: 'shield', shortDescription: '', longDescription: '', weight: 3, hidden: false, weaponDamage: null, armorDefense: 2, equipped: true },
    ];
    (tpl3 as unknown as { startingItems: unknown[] }).startingItems = items;
    const result = expandSpawn({ template: tpl3, locationId: LOC, count: 2 });
    expect(result.agents).toHaveLength(2);
    expect(result.items).toHaveLength(4); // 2 items × 2 agents
  });

  it('enforces one-weapon limit at spawn — second weapon gets equipped:false', () => {
    const tpl4 = baseTpl();
    const items = [
      { kind: StarterPackEntryKind.Inline, label: 'sword', shortDescription: '', longDescription: '', weight: 2, hidden: false, weaponDamage: 4, armorDefense: null, equipped: true },
      { kind: StarterPackEntryKind.Inline, label: 'dagger', shortDescription: '', longDescription: '', weight: 1, hidden: false, weaponDamage: 2, armorDefense: null, equipped: true },
    ];
    (tpl4 as unknown as { startingItems: unknown[] }).startingItems = items;
    const result = expandSpawn({ template: tpl4, locationId: LOC, count: 1 });
    const equippedWeapons = result.items.filter((i) => i.weaponDamage !== null && i.equipped);
    expect(equippedWeapons).toHaveLength(1);
    expect(equippedWeapons[0]?.label).toBe('dagger'); // last one wins
  });
});
