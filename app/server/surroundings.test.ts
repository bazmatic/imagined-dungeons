import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { buildSurroundings } from './surroundings';

const W = asWorldId('w');
const LOC = asLocationId('loc_tavern');
const PLAYER = asAgentId('char_player');
const SPARK = asAgentId('char_spark');
const PAFF = asAgentId('char_paff');
const MAP = asItemId('item_map');
const HIDDEN = asItemId('item_hidden');
const EXIT_N = asExitId('exit_n');
const EXIT_S = asExitId('exit_s');

const loc: Location = {
  id: LOC,
  worldId: W,
  label: 'The Flaming Goblet',
  shortDescription: 'a tavern with a wall on fire',
  longDescription: 'A tavern with one wall constantly aflame.',
  tags: [],
  secretDescription: '',
};

const player: Agent = {
  id: PLAYER,
  worldId: W,
  label: 'You',
  shortDescription: '',
  longDescription: '',
  locationId: LOC,
  hp: 20,
  damage: 2,
  defense: 12,
  capacity: 30,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  secretDescription: '',
};

const spark: Agent = {
  id: SPARK,
  worldId: W,
  label: 'Spark',
  shortDescription: 'a halfling courier',
  longDescription: '',
  locationId: LOC,
  hp: 18,
  damage: 2,
  defense: 14,
  capacity: 10,
  mood: 'energetic',
  shortTermIntent: null,
  goal: null,
  autonomous: true,
  awake: true,
  gold: 0,
  tags: [],
  secretDescription: '',
};

const paff: Agent = {
  id: PAFF,
  worldId: W,
  label: 'Paff Pinkerton',
  shortDescription: 'a tavern-keeper',
  longDescription: '',
  locationId: LOC,
  hp: 20,
  damage: 2,
  defense: 12,
  capacity: 30,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  secretDescription: '',
};

const map: Item = {
  id: MAP,
  worldId: W,
  label: 'fire map',
  shortDescription: 'a hand-drawn map',
  longDescription: '',
  owner: { kind: OwnerKind.Location, id: LOC },
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
};

const hidden: Item = {
  id: HIDDEN,
  worldId: W,
  label: 'secret token',
  shortDescription: '',
  longDescription: '',
  owner: { kind: OwnerKind.Location, id: LOC },
  weight: 1,
  hidden: true,
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
  weaponDamage: null,
  armorDefense: null,
};

const SWORD = asItemId('item_sword');
const POTION = asItemId('item_potion');

const sword: Item = {
  id: SWORD,
  worldId: W,
  label: 'Iron Sword',
  shortDescription: 'a sturdy blade',
  longDescription: '',
  owner: { kind: OwnerKind.Agent, id: PAFF },
  weight: 3,
  hidden: false,
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: 5,
  weaponDamage: null,
  armorDefense: null,
};

const potion: Item = {
  id: POTION,
  worldId: W,
  label: 'Health Potion',
  shortDescription: 'restores a small amount of vitality',
  longDescription: '',
  owner: { kind: OwnerKind.Agent, id: PAFF },
  weight: 1,
  hidden: false,
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: 10,
  weaponDamage: null,
  armorDefense: null,
};

const notForSale: Item = {
  id: asItemId('item_not_for_sale'),
  worldId: W,
  label: 'Paff\'s Mug',
  shortDescription: 'a personal mug',
  longDescription: '',
  owner: { kind: OwnerKind.Agent, id: PAFF },
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
};

const exitN: Exit = {
  id: EXIT_N,
  worldId: W,
  from: LOC,
  to: LOC,
  direction: 'north',
  label: 'Tavern Back Door',
  locked: true,
  lockedByItem: null,
};

const exitS: Exit = {
  id: EXIT_S,
  worldId: W,
  from: LOC,
  to: LOC,
  direction: 'south',
  label: 'south',
  locked: false,
  lockedByItem: null,
};

const makeRepo = (): MemoryRepository =>
  new MemoryRepository(W, {
    locations: [loc],
    exits: [exitN, exitS],
    items: [map, hidden],
    agents: [player, spark, paff],
  });

const makeRepoWithWares = (): MemoryRepository =>
  new MemoryRepository(W, {
    locations: [loc],
    exits: [exitN, exitS],
    items: [map, hidden, sword, potion, notForSale],
    agents: [player, spark, paff],
  });

describe('buildSurroundings', () => {
  it('returns visible items as { id, label }', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.items).toEqual([{ id: 'item_map', label: 'fire map' }]);
  });

  it('excludes hidden items', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.items.find((i) => i.id === 'item_hidden')).toBeUndefined();
  });

  it('returns exits with locked flag and label nulled when label === direction', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.exits).toEqual([
      { id: 'exit_n', direction: 'north', label: 'Tavern Back Door', locked: true },
      { id: 'exit_s', direction: 'south', label: null, locked: false },
    ]);
  });

  it('returns characters with mood passed through verbatim and null preserved', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.characters).toEqual([
      {
        id: 'char_spark',
        label: 'Spark',
        shortDescription: 'a halfling courier',
        mood: 'energetic',
        hp: 18,
        wares: [],
      },
      {
        id: 'char_paff',
        label: 'Paff Pinkerton',
        shortDescription: 'a tavern-keeper',
        mood: null,
        hp: 20,
        wares: [],
      },
    ]);
  });

  it('does not include the player themselves in characters', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.characters.find((c) => c.id === 'char_player')).toBeUndefined();
  });

  it('includes for-sale items (priceTag > 0) in wares for their owning character', async () => {
    const repo = makeRepoWithWares();
    const r = await buildSurroundings(PLAYER, repo);
    const paff = r.characters.find((c) => c.id === 'char_paff');
    expect(paff?.wares).toEqual([
      { id: 'item_sword', label: 'Iron Sword', shortDescription: 'a sturdy blade', priceTag: 5 },
      { id: 'item_potion', label: 'Health Potion', shortDescription: 'restores a small amount of vitality', priceTag: 10 },
    ]);
  });

  it('excludes items owned by the character with priceTag null', async () => {
    const repo = makeRepoWithWares();
    const r = await buildSurroundings(PLAYER, repo);
    const paff = r.characters.find((c) => c.id === 'char_paff');
    expect(paff?.wares.find((w) => w.id === 'item_not_for_sale')).toBeUndefined();
  });

  it('returns empty wares for a character with no items for sale', async () => {
    const repo = makeRepoWithWares();
    const r = await buildSurroundings(PLAYER, repo);
    const spark = r.characters.find((c) => c.id === 'char_spark');
    expect(spark?.wares).toEqual([]);
  });
});
