import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './llm-prompt';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const tavern: Location = {
  id: A,
  worldId: W,
  label: 'The Flaming Goblet',
  shortDescription: '',
  longDescription: 'A warm tavern.',
};
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
  goal: null,
  autonomous: false,
};
const spark: Agent = {
  ...paff,
  id: asAgentId('char_s'),
  label: 'Spark',
};
const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'location', id: A },
  weight: 1,
  hidden: false,
};
const exitSouth: Exit = {
  id: asExitId('e_s'),
  worldId: W,
  from: A,
  to: asLocationId('loc_b'),
  direction: 'south',
  label: 'south door',
  locked: false,
  lockedByItem: null,
};

describe('buildSystemPrompt', () => {
  it('mentions every action variant by name', () => {
    const s = buildSystemPrompt();
    for (const verb of ['move', 'look', 'take', 'drop', 'inventory', 'unknown']) {
      expect(s).toContain(verb);
    }
  });

  it('instructs the model to choose unknown over guessing', () => {
    expect(buildSystemPrompt().toLowerCase()).toContain('unknown');
  });
});

describe('buildUserPrompt', () => {
  it('includes the verbatim player input, location, items, agents, exits, inventory', () => {
    const u = buildUserPrompt(
      'head out the south door',
      paff,
      {
        actor: paff,
        location: tavern,
        items: [map],
        agents: [spark],
        exits: [exitSouth],
      },
      [],
    );
    expect(u).toContain('head out the south door');
    expect(u).toContain('Paff');
    expect(u).toContain('The Flaming Goblet');
    expect(u).toContain('fire map');
    expect(u).toContain('Spark');
    expect(u).toContain('south');
    expect(u.toLowerCase()).toContain('inventory');
  });

  it('uses "none" / "empty" placeholders when sections are empty', () => {
    const u = buildUserPrompt(
      'look',
      paff,
      {
        actor: paff,
        location: tavern,
        items: [],
        agents: [],
        exits: [],
      },
      [],
    );
    expect(u.toLowerCase()).toContain('none');
    expect(u.toLowerCase()).toContain('empty');
  });
});
