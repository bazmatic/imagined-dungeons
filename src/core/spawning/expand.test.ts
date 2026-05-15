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
  labelPrefixInstructions: null,
  shortDescription: 'a goblin',
  longDescription: 'a small goblin',
  hpMin: 3,
  hpMax: 5,
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
      expect(a.hp).toBeGreaterThanOrEqual(tpl.hpMin);
      expect(a.hp).toBeLessThanOrEqual(tpl.hpMax);
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

  it('uses provided labels array instead of template.label', () => {
    const labels = ['[Tall] goblin', '[Short] goblin', '[Old] goblin'];
    const inserts = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3, labels });
    expect(inserts.map((a) => a.label)).toEqual(labels);
  });

  it('falls back to template.label when labels array is shorter than count', () => {
    const labels = ['[Tall] goblin'];
    const inserts = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3, labels });
    expect(inserts[0]?.label).toBe('[Tall] goblin');
    expect(inserts[1]?.label).toBe('goblin');
    expect(inserts[2]?.label).toBe('goblin');
  });

  it('rolls hp within hpMin/hpMax range', () => {
    const fixedTpl: MonsterTemplate = { ...tpl, hpMin: 5, hpMax: 5 };
    const inserts = expandSpawn({ template: fixedTpl, locationId: asLocationId('loc_a'), count: 5 });
    for (const a of inserts) {
      expect(a.hp).toBe(5);
    }
  });
});
