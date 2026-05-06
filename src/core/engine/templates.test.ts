import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import {
  renderActionError,
  renderDropSelf,
  renderInventory,
  renderLook,
  renderMoveSelf,
  renderParseError,
  renderTakeSelf,
} from './templates';

const W = asWorldId('w');
const A = asLocationId('loc_a');

const loc: Location = {
  id: A,
  worldId: W,
  label: 'The Goblet',
  shortDescription: 'A tavern.',
  longDescription: 'A tavern with one wall aflame.',
};

const itemA: Item = {
  id: asItemId('item_a'),
  worldId: W,
  label: 'fire map',
  shortDescription: 'a map',
  longDescription: 'A real-time map.',
  owner: { kind: 'location', id: A },
  weight: 1,
  hidden: false,
};

const npc: Agent = {
  id: asAgentId('char_n'),
  worldId: W,
  label: 'Spark',
  shortDescription: 's',
  longDescription: 's',
  locationId: A,
  hp: 1,
  damage: 0,
  defense: 0,
  capacity: 0,
  mood: null,
  goal: null,
  autonomous: false,
};

const exitN: Exit = {
  id: asExitId('e1'),
  worldId: W,
  from: A,
  to: asLocationId('loc_b'),
  direction: 'north',
  label: 'Tavern Back Door',
  locked: true,
  lockedByItem: asItemId('item_key'),
};
const exitS: Exit = {
  id: asExitId('e2'),
  worldId: W,
  from: A,
  to: asLocationId('loc_c'),
  direction: 'south',
  label: 'Tavern Front Door',
  locked: false,
  lockedByItem: null,
};

describe('templates', () => {
  it('renderLook produces a multi-line description with items, agents, exits', () => {
    const out = renderLook({
      actor: npc,
      location: loc,
      items: [itemA],
      agents: [npc],
      exits: [exitN, exitS],
    });
    expect(out).toContain('The Goblet');
    expect(out).toContain('A tavern with one wall aflame.');
    expect(out).toContain('You see: fire map.');
    expect(out).toContain('Also here: Spark.');
    expect(out).toContain('Exits:');
    expect(out).toContain('north (Tavern Back Door, locked)');
    expect(out).toContain('south (Tavern Front Door)');
  });

  it('renderLook with no items/agents omits those lines', () => {
    const out = renderLook({ actor: npc, location: loc, items: [], agents: [], exits: [exitS] });
    expect(out).not.toContain('You see:');
    expect(out).not.toContain('Also here:');
  });

  it('renderMoveSelf names the direction', () => {
    expect(renderMoveSelf('north')).toBe('You go north.');
  });

  it('renderTakeSelf and renderDropSelf name the item', () => {
    expect(renderTakeSelf(itemA)).toBe('Taken: fire map.');
    expect(renderDropSelf(itemA)).toBe('Dropped: fire map.');
  });

  it('renderInventory lists items or says empty', () => {
    expect(renderInventory([])).toBe('You are carrying nothing.');
    expect(renderInventory([itemA])).toBe('You are carrying: fire map.');
  });

  it('renderParseError covers all variants', () => {
    expect(renderParseError({ kind: 'empty' })).toMatch(/type a command/i);
    expect(renderParseError({ kind: 'unknown_verb', verb: 'frobnicate' })).toContain('frobnicate');
    expect(renderParseError({ kind: 'missing_argument', verb: 'take' })).toContain('take');
    expect(renderParseError({ kind: 'unknown_direction', raw: 'sideways' })).toContain('sideways');
    expect(renderParseError({ kind: 'no_such_target', ref: 'unicorn' })).toContain('unicorn');
    expect(
      renderParseError({
        kind: 'ambiguous_target',
        ref: 'key',
        candidates: ['rusty key', 'silver key'],
      }),
    ).toContain('rusty key');
  });

  it('renderActionError returns the supplied reason', () => {
    expect(renderActionError("You can't go that way.")).toBe("You can't go that way.");
  });
});
