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
  tags: [],
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
  tags: [],
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
  tags: [],
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
      },
      {
        id: 'char_paff',
        label: 'Paff Pinkerton',
        shortDescription: 'a tavern-keeper',
        mood: null,
      },
    ]);
  });

  it('does not include the player themselves in characters', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.characters.find((c) => c.id === 'char_player')).toBeUndefined();
  });
});
