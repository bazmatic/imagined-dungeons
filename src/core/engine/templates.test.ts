import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { asEventId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import {
  renderActionError,
  renderDropSelf,
  renderEmoteMechanical,
  renderInventory,
  renderLook,
  renderMoveSelf,
  renderParseError,
  renderTakeSelf,
  thirdPersonVerb,
} from './templates';

const W = asWorldId('w');
const A = asLocationId('loc_a');

const loc: Location = {
  id: A,
  worldId: W,
  label: 'The Goblet',
  shortDescription: 'A tavern.',
  longDescription: 'A tavern with one wall aflame.',
  tags: [],
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
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
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

describe('thirdPersonVerb', () => {
  it('appends an "s" to a base verb that does not end in "s"', () => {
    expect(thirdPersonVerb('wave')).toBe('waves');
    expect(thirdPersonVerb('grin')).toBe('grins');
  });

  it('is idempotent — already-third-person stays', () => {
    expect(thirdPersonVerb('waves')).toBe('waves');
    expect(thirdPersonVerb('grins')).toBe('grins');
  });

  it('is a no-op for verbs that already end in "s" ("kiss", "fuss")', () => {
    expect(thirdPersonVerb('kiss')).toBe('kiss');
    expect(thirdPersonVerb('fuss')).toBe('fuss');
  });

  it('does the simple thing for non-s endings ("splash" → "splashs"), keeping behaviour predictable', () => {
    // The helper does not know English orthography; "splash" → "splashs" is
    // grammatically off but acceptable per the spec ("keep grammatically
    // permissive — the description verb is whatever the parser produced").
    expect(thirdPersonVerb('splash')).toBe('splashs');
  });

  it('only conjugates the leading word for multi-word descriptions', () => {
    expect(thirdPersonVerb('shake their head')).toBe('shakes their head');
    expect(thirdPersonVerb('grin broadly')).toBe('grins broadly');
  });

  it('handles empty input safely', () => {
    expect(thirdPersonVerb('')).toBe('');
  });
});

describe('renderEmoteMechanical', () => {
  const paff: Agent = {
    id: asAgentId('char_p'),
    worldId: W,
    label: 'Paff',
    shortDescription: '',
    longDescription: '',
    locationId: A,
    hp: 10,
    damage: 0,
    defense: 0,
    capacity: 10,
    mood: null,
    shortTermIntent: null,
    goal: null,
    autonomous: false,
    awake: false,
  };
  const spark: Agent = {
    id: asAgentId('char_s'),
    worldId: W,
    label: 'Spark',
    shortDescription: '',
    longDescription: '',
    locationId: A,
    hp: 10,
    damage: 0,
    defense: 0,
    capacity: 10,
    mood: null,
    shortTermIntent: null,
    goal: null,
    autonomous: false,
    awake: false,
  };
  const ember: Agent = {
    id: asAgentId('char_e'),
    worldId: W,
    label: 'Ember',
    shortDescription: '',
    longDescription: '',
    locationId: A,
    hp: 10,
    damage: 0,
    defense: 0,
    capacity: 10,
    mood: null,
    shortTermIntent: null,
    goal: null,
    autonomous: false,
    awake: false,
  };
  const evWith = (
    description: string,
    targetId: string | null,
  ): Extract<DomainEvent, { kind: 'emote' }> => ({
    id: asEventId('e1'),
    worldId: W,
    actorId: paff.id,
    kind: 'emote',
    witnesses: [paff.id, spark.id],
    createdAt: new Date(),
    description,
    targetAgentId: targetId as Extract<DomainEvent, { kind: 'emote' }>['targetAgentId'],
  });

  it('renders second-person for the actor', () => {
    expect(renderEmoteMechanical(evWith('wave', spark.id), paff, paff, spark)).toBe('You wave.');
  });

  it('renders second-person addressed to the target', () => {
    expect(renderEmoteMechanical(evWith('wave', spark.id), paff, spark, spark)).toBe(
      'Paff waves at you.',
    );
  });

  it('renders third-person with target for an outside observer', () => {
    expect(renderEmoteMechanical(evWith('wave', spark.id), paff, ember, spark)).toBe(
      'Paff waves at Spark.',
    );
  });

  it('renders third-person without target when targetAgentId is null', () => {
    expect(renderEmoteMechanical(evWith('shrug', null), paff, ember, null)).toBe('Paff shrugs.');
  });

  it('uses the description verbatim for second-person actor (no double-s)', () => {
    // Even if the model accidentally sends a third-person form, the second-person
    // output is what the parser/LLM gave — kept grammatically permissive.
    expect(renderEmoteMechanical(evWith('shake their head', null), paff, paff, null)).toBe(
      'You shake their head.',
    );
  });

  it('does not double-pluralise a description already in third person', () => {
    expect(renderEmoteMechanical(evWith('waves', spark.id), paff, ember, spark)).toBe(
      'Paff waves at Spark.',
    );
  });
});
