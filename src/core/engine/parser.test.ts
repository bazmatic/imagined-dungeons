import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { parse, resolveAgent } from './parser';
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
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
};
const LOC: Location = {
  id: asLocationId('loc_a'),
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
  tags: [],
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
const rustyKey: Item = {
  id: asItemId('item_rusty'),
  worldId: W,
  label: 'rusty key',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'location', id: LOC.id },
  weight: 1,
  hidden: false,
};
const silverKey: Item = {
  id: asItemId('item_silver'),
  worldId: W,
  label: 'silver key',
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

const spark: Agent = {
  id: asAgentId('char_spark'),
  worldId: W,
  label: 'Spark',
  shortDescription: '',
  longDescription: '',
  locationId: asLocationId('loc_a'),
  hp: 10,
  damage: 1,
  defense: 0,
  capacity: 10,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
};
const ember: Agent = {
  id: asAgentId('char_ember'),
  worldId: W,
  label: 'Ember',
  shortDescription: '',
  longDescription: '',
  locationId: asLocationId('loc_a'),
  hp: 10,
  damage: 1,
  defense: 0,
  capacity: 10,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
};

const view = (items: Item[] = [map], agents: Agent[] = []): PerceptionView => ({
  actor: ACTOR,
  location: LOC,
  items,
  agents,
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

  it('"look" with no target targets the room', () => {
    const r = parse('look', ACTOR, view(), inv());
    if (r.kind !== 'look') throw new Error();
    expect(r.target).toEqual({ kind: 'room' });
  });

  it('"look at the fire map" resolves to an item target', () => {
    const r = parse('look at the fire map', ACTOR, view(), inv());
    if (r.kind !== 'look') throw new Error();
    expect(r.target).toEqual({ kind: 'item', id: map.id });
  });

  it('"look at spark" resolves to an agent target', () => {
    const r = parse('look at spark', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'look') throw new Error();
    expect(r.target).toEqual({ kind: 'agent', id: spark.id });
  });

  it('"look at the door" resolves to an exit target by label', () => {
    const r = parse('look at the d', ACTOR, view(), inv());
    if (r.kind !== 'look') throw new Error();
    expect(r.target).toEqual({ kind: 'exit', id: exitN.id });
  });

  it('"take fire map" yields take action with resolved id', () => {
    const r = parse('take fire map', ACTOR, view(), inv());
    if (r.kind !== 'take') throw new Error();
    expect(r.itemId).toBe(map.id);
  });

  it('"I take the fire map." (NPC sentence with trailing period) resolves the item', () => {
    const r = parse('I take the fire map.', ACTOR, view(), inv());
    if (r.kind !== 'take') throw new Error();
    expect(r.itemId).toBe(map.id);
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

  it('"drop fire map" with map in inventory parses to a resolved id', () => {
    const r = parse('drop fire map', ACTOR, view([]), inv([map]));
    if (r.kind !== 'drop') throw new Error();
    expect(r.itemId).toBe(map.id);
  });

  it('"give fire map to spark" parses to a give action with both refs resolved', () => {
    const r = parse('give fire map to spark', ACTOR, view([], [spark]), inv([map]));
    if (r.kind !== 'give') throw new Error(`expected give, got ${r.kind}`);
    expect(r.itemId).toBe(map.id);
    expect(r.targetAgentId).toBe(spark.id);
  });

  it('"hand the fire map to Spark" works as an alias for give', () => {
    const r = parse('hand the fire map to Spark', ACTOR, view([], [spark]), inv([map]));
    if (r.kind !== 'give') throw new Error(`expected give, got ${r.kind}`);
    expect(r.itemId).toBe(map.id);
  });

  it('"I give the fire map to Spark." (NPC sentence form) resolves cleanly', () => {
    const r = parse('I give the fire map to Spark.', ACTOR, view([], [spark]), inv([map]));
    if (r.kind !== 'give') throw new Error(`expected give, got ${r.kind}`);
    expect(r.itemId).toBe(map.id);
    expect(r.targetAgentId).toBe(spark.id);
  });

  it('"give to spark" yields missing_argument (no item)', () => {
    const r = parse('give to spark', ACTOR, view([], [spark]), inv([map]));
    expect(r.kind).toBe('missing_argument');
  });

  it('"give fire map to nobody" yields no_such_target on the recipient', () => {
    const r = parse('give fire map to nobody', ACTOR, view([], [spark]), inv([map]));
    expect(r.kind).toBe('no_such_target');
  });

  it('"give fire map to spark" when fire map is on the floor (not held) yields no_such_target', () => {
    // Item is in the room, not in inventory: you can't give what you don't carry.
    const r = parse('give fire map to spark', ACTOR, view([map], [spark]), inv());
    expect(r.kind).toBe('no_such_target');
  });

  it('"take fire map" with empty view yields no_such_target', () => {
    const r = parse('take fire map', ACTOR, view([]), inv());
    if (r.kind !== 'no_such_target') throw new Error();
    expect(r.ref).toBe('fire map');
  });

  it('"drop fire map" with empty inventory yields no_such_target', () => {
    const r = parse('drop fire map', ACTOR, view([]), inv());
    if (r.kind !== 'no_such_target') throw new Error();
    expect(r.ref).toBe('fire map');
  });

  it('"look unicorn" with no matching item yields no_such_target', () => {
    const r = parse('look unicorn', ACTOR, view(), inv());
    if (r.kind !== 'no_such_target') throw new Error();
    expect(r.ref).toBe('unicorn');
  });

  it('"look around me" yields no_such_target (the bug repro)', () => {
    const r = parse('look around me', ACTOR, view(), inv());
    expect(r.kind).toBe('no_such_target');
  });

  it('"take key" with rusty + silver in view yields ambiguous_target', () => {
    const r = parse('take key', ACTOR, view([rustyKey, silverKey]), inv());
    if (r.kind !== 'ambiguous_target') throw new Error();
    expect(r.candidates).toEqual(expect.arrayContaining(['rusty key', 'silver key']));
  });

  it('"take fire map" with the map already in inventory yields already_carried', () => {
    // The parser searches the room first; when the ref doesn't resolve there
    // but DOES resolve in inventory, surface a useful error rather than
    // "you don't see one" (which is misleading when you're holding it).
    const r = parse('take fire map', ACTOR, view([]), inv([map]));
    if (r.kind !== 'already_carried') throw new Error('expected already_carried');
    expect(r.label).toBe('fire map');
  });

  it('"take fire map" with the map nowhere visible yields no_such_target', () => {
    const r = parse('take fire map', ACTOR, view([]), inv());
    expect(r.kind).toBe('no_such_target');
  });

  it('"talk to spark, hello" parses to speak with utterance', () => {
    const r = parse('talk to spark, hello', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'speak') throw new Error('expected speak');
    expect(r.targetAgentId).toBe(spark.id);
    expect(r.utterance).toBe('hello');
  });

  it('"tell spark, hello there" parses to speak with full utterance', () => {
    const r = parse('tell spark, hello there', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'speak') throw new Error('expected speak');
    expect(r.targetAgentId).toBe(spark.id);
    expect(r.utterance).toBe('hello there');
  });

  it('"tell spark hello" without comma parses to speak with utterance', () => {
    const r = parse('tell spark hello', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'speak') throw new Error('expected speak');
    expect(r.targetAgentId).toBe(spark.id);
    expect(r.utterance).toBe('hello');
  });

  it('"speak to spark, are you well?" parses to speak', () => {
    const r = parse('speak to spark, are you well?', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'speak') throw new Error('expected speak');
    expect(r.targetAgentId).toBe(spark.id);
    expect(r.utterance).toBe('are you well?');
  });

  it('"say hello" without an explicit target broadcasts (targetAgentId === null) regardless of who is present', () => {
    // No agents, one agent, two agents — all the same: speech is broadcast.
    // Listeners (their NPC mind) decide whether they think it was meant for
    // them via vocative cues in the utterance.
    expect(parse('say hello', ACTOR, view([map], []), inv())).toMatchObject({
      kind: 'speak',
      targetAgentId: null,
      utterance: 'hello',
    });
    expect(parse('say hello', ACTOR, view([map], [spark]), inv())).toMatchObject({
      kind: 'speak',
      targetAgentId: null,
      utterance: 'hello',
    });
    expect(parse('say hello', ACTOR, view([map], [spark, ember]), inv())).toMatchObject({
      kind: 'speak',
      targetAgentId: null,
      utterance: 'hello',
    });
  });

  it('"say \\"what are you doing Spark?\\"" broadcasts; listener mind handles the vocative', () => {
    const r = parse('say "what are you doing Spark?"', ACTOR, view([map], [spark, ember]), inv());
    if (r.kind !== 'speak') throw new Error(`expected speak, got ${r.kind}`);
    expect(r.targetAgentId).toBeNull();
    expect(r.utterance).toBe('what are you doing Spark?');
  });

  it('"say \\"hi\\" to spark" parses utterance + explicit target with two agents present', () => {
    const r = parse('say "hi" to spark', ACTOR, view([map], [spark, ember]), inv());
    if (r.kind !== 'speak') throw new Error('expected speak');
    expect(r.targetAgentId).toBe(spark.id);
    expect(r.utterance).toBe('hi');
  });

  it('"I say \\"hi\\" to Paff Pinkerton." (NPC-mind shape) parses cleanly', () => {
    // After the leading-`I` strip the verb is `say`. Then the parser must:
    //   - drop the trailing "to Paff Pinkerton" target clause
    //   - strip surrounding quotes and the trailing period
    // utterance must be just "hi", not "\"hi\" to Paff Pinkerton."
    const paff: Agent = {
      id: asAgentId('char_paff'),
      worldId: W,
      label: 'Paff Pinkerton',
      shortDescription: '',
      longDescription: '',
      locationId: asLocationId('loc_a'),
      hp: 20,
      damage: 2,
      defense: 12,
      capacity: 30,
      mood: null,
      shortTermIntent: null,
      goal: null,
      autonomous: false,
      awake: false,
    };
    const speakerView: PerceptionView = {
      actor: spark,
      location: LOC,
      items: [],
      agents: [paff],
      exits: [exitN],
    };
    const r = parse('I say "hi" to Paff Pinkerton.', spark, speakerView, inv());
    if (r.kind !== 'speak') throw new Error(`expected speak, got ${r.kind}`);
    expect(r.targetAgentId).toBe(paff.id);
    expect(r.utterance).toBe('hi');
  });

  it('"say" alone yields missing_argument', () => {
    const r = parse('say', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'missing_argument') throw new Error('expected missing_argument');
    expect(r.verb).toBe('say');
  });

  it('"attack spark" yields attack action with resolved id', () => {
    const r = parse('attack spark', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'attack') throw new Error('expected attack');
    expect(r.targetAgentId).toBe(spark.id);
  });

  it('"kill spark" and "fight spark" also parse to attack', () => {
    const r1 = parse('kill spark', ACTOR, view([map], [spark]), inv());
    const r2 = parse('fight spark', ACTOR, view([map], [spark]), inv());
    if (r1.kind !== 'attack' || r2.kind !== 'attack') throw new Error();
    expect(r1.targetAgentId).toBe(spark.id);
    expect(r2.targetAgentId).toBe(spark.id);
  });

  it('"attack" with no target yields missing_argument', () => {
    const r = parse('attack', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'missing_argument') throw new Error('expected missing_argument');
    expect(r.verb).toBe('attack');
  });

  it('"attack ghost" with no such agent yields no_such_target', () => {
    const r = parse('attack ghost', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'no_such_target') throw new Error('expected no_such_target');
    expect(r.ref).toBe('ghost');
  });

  it('"emote waves" parses to an untargeted emote with the description', () => {
    const r = parse('emote waves', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'emote') throw new Error('expected emote');
    expect(r.description).toBe('waves');
    expect(r.targetAgentId).toBeNull();
  });

  it('"gesture grins broadly" (synonym) parses to emote', () => {
    const r = parse('gesture grins broadly', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'emote') throw new Error('expected emote');
    expect(r.description).toBe('grins broadly');
    expect(r.targetAgentId).toBeNull();
  });

  it('"emote at Spark waves" parses to a targeted emote', () => {
    const r = parse('emote at Spark waves', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'emote') throw new Error('expected emote');
    expect(r.description).toBe('waves');
    expect(r.targetAgentId).toBe(spark.id);
  });

  it('"emote spark, grins" parses to a targeted emote via comma split', () => {
    const r = parse('emote spark, grins', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'emote') throw new Error('expected emote');
    expect(r.description).toBe('grins');
    expect(r.targetAgentId).toBe(spark.id);
  });

  it('"emote" alone yields missing_argument', () => {
    const r = parse('emote', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'missing_argument') throw new Error('expected missing_argument');
    expect(r.verb).toBe('emote');
  });

  it('"I emote wave" honours the leading-I strip', () => {
    const r = parse('I emote wave', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'emote') throw new Error('expected emote');
    expect(r.description).toBe('wave');
    expect(r.targetAgentId).toBeNull();
  });

  it('"emote \\"waves broadly\\"" strips surrounding quotes', () => {
    const r = parse('emote "waves broadly"', ACTOR, view([map], [spark]), inv());
    if (r.kind !== 'emote') throw new Error('expected emote');
    expect(r.description).toBe('waves broadly');
  });
});

describe('resolveAgent', () => {
  it('resolves an exact label match', () => {
    const r = resolveAgent('Spark', [spark, ember]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.agent.id).toBe(spark.id);
  });

  it('resolves case-insensitively via prefix', () => {
    const r = resolveAgent('spa', [spark, ember]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.agent.id).toBe(spark.id);
  });

  it('returns ambiguous_target on multiple prefix matches', () => {
    const sparky: Agent = { ...spark, id: asAgentId('char_sparky'), label: 'Sparky' };
    const r = resolveAgent('spa', [spark, sparky]);
    if (r.ok) throw new Error('expected error');
    expect(r.error.kind).toBe('ambiguous_target');
  });

  it('returns no_such_target when nothing matches', () => {
    const r = resolveAgent('ghost', [spark]);
    if (r.ok) throw new Error('expected error');
    expect(r.error.kind).toBe('no_such_target');
  });
});
