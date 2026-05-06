import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import type { PerceptionView } from './perception';

const W = asWorldId('w');
const ACTOR: Agent = {
  id: asAgentId('char_self'),
  worldId: W,
  label: 'Paff',
  shortDescription: '',
  longDescription: '',
  locationId: asLocationId('loc_a'),
  hp: 10,
  damage: 0,
  defense: 0,
  capacity: 10,
  mood: null,
  goal: null,
  autonomous: false,
};
const LOC: Location = {
  id: asLocationId('loc_a'),
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
};
const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'location', id: LOC.id },
  weight: 1,
  hidden: false,
};
const exitN: Exit = {
  id: asExitId('e'),
  worldId: W,
  from: LOC.id,
  to: asLocationId('loc_b'),
  direction: 'north',
  label: 'd',
  locked: false,
  lockedByItem: null,
};

const view = (items: Item[] = [map]): PerceptionView => ({
  actor: ACTOR,
  location: LOC,
  items,
  agents: [],
  exits: [exitN],
});

const inv = (items: Item[] = []): readonly Item[] => items;

describe('parse', () => {
  it('empty input yields empty error', () => {
    const r = parse('', ACTOR, view(), inv());
    expect(r.kind).toBe('empty');
  });

  it('unknown verb', () => {
    const r = parse('frobnicate the widget', ACTOR, view(), inv());
    if (r.kind !== 'unknown_verb') throw new Error('expected unknown_verb');
    expect(r.verb).toBe('frobnicate');
  });

  it('north and "n" both parse to move(north)', () => {
    const r1 = parse('north', ACTOR, view(), inv());
    const r2 = parse('n', ACTOR, view(), inv());
    if (r1.kind !== 'move' || r2.kind !== 'move') throw new Error();
    expect(r1.direction).toBe('north');
    expect(r2.direction).toBe('north');
  });

  it('"go north" parses to move(north)', () => {
    const r = parse('go north', ACTOR, view(), inv());
    if (r.kind !== 'move') throw new Error();
    expect(r.direction).toBe('north');
  });

  it('"move sideways" yields unknown_direction', () => {
    const r = parse('move sideways', ACTOR, view(), inv());
    expect(r.kind).toBe('unknown_direction');
  });

  it('"look" with no target', () => {
    const r = parse('look', ACTOR, view(), inv());
    if (r.kind !== 'look') throw new Error();
    expect(r.targetRef).toBeNull();
  });

  it('"look at the fire map" strips article + preposition', () => {
    const r = parse('look at the fire map', ACTOR, view(), inv());
    if (r.kind !== 'look') throw new Error();
    expect(r.targetRef).toBe('fire map');
  });

  it('"take fire map" yields take action', () => {
    const r = parse('take fire map', ACTOR, view(), inv());
    if (r.kind !== 'take') throw new Error();
    expect(r.itemRef).toBe('fire map');
  });

  it('"take" alone yields missing_argument', () => {
    const r = parse('take', ACTOR, view(), inv());
    if (r.kind !== 'missing_argument') throw new Error();
    expect(r.verb).toBe('take');
  });

  it('"i" and "inventory" both produce inventory action', () => {
    expect(parse('i', ACTOR, view(), inv()).kind).toBe('inventory');
    expect(parse('inventory', ACTOR, view(), inv()).kind).toBe('inventory');
  });

  it('"drop fire map" with map in inventory parses', () => {
    const r = parse('drop fire map', ACTOR, view([]), inv([map]));
    if (r.kind !== 'drop') throw new Error();
    expect(r.itemRef).toBe('fire map');
  });
});
