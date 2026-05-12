import type { MonsterTemplate } from '@core/domain/builder-types';
import { asLocationId, asMonsterTemplateId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { expandSpawn } from './expand';

const W = asWorldId('w_live');
const tpl: MonsterTemplate = {
  id: asMonsterTemplateId('tpl_goblin'),
  worldId: W,
  templateKey: 'goblin',
  label: 'goblin',
  shortDescription: 'a goblin',
  longDescription: 'a small goblin',
  hp: 5,
  mood: 'wary',
  startingItems: [],
  tags: [],
};

describe('expandSpawn', () => {
  it('produces count agent inserts at the given location', () => {
    const inserts = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3 });
    expect(inserts).toHaveLength(3);
    for (const a of inserts) {
      expect(a.locationId).toBe(asLocationId('loc_a'));
      expect(a.label).toBe('goblin');
      expect(a.hp).toBe(5);
      expect(a.mood).toBe('wary');
    }
  });

  it('mints unique ids per call', () => {
    const inserts = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 4 });
    const ids = new Set(inserts.map((a) => a.id as string));
    expect(ids.size).toBe(4);
  });

  it('copies template.tags onto the spawned agent insert', () => {
    const tagged: MonsterTemplate = { ...tpl, tags: ['goblin', 'cult'] };
    const out = expandSpawn({ template: tagged, locationId: asLocationId('loc_a'), count: 1 });
    expect(out).toHaveLength(1);
    const [first] = out;
    if (!first) throw new Error('expected one insert');
    expect(first.tags).toEqual(['goblin', 'cult']);
  });
});
