import { ProblemKind, WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { describe, expect, it } from 'vitest';
import { validateWorld } from './validate';

const W = asWorldId('w_test');

const baseTree = (): WorldTree => ({
  summary: {
    id: W,
    kind: WorldKind.Draft,
    label: 'L',
    displayName: 'D',
    parentDraftId: null,
    playerAgentId: asAgentId('char_p'),
  },
  locations: [
    {
      id: asLocationId('loc_a'),
      worldId: W,
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
    },
    {
      id: asLocationId('loc_b'),
      worldId: W,
      label: 'B',
      shortDescription: 'b',
      longDescription: 'b',
    },
  ],
  exits: [],
  items: [],
  agents: [
    {
      id: asAgentId('char_p'),
      worldId: W,
      label: 'Player',
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
    },
  ],
});

describe('validateWorld', () => {
  it('returns no problems for a clean tree', () => {
    expect(validateWorld(baseTree())).toEqual([]);
  });

  it('reports ExitFromMissing', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      exits: [
        {
          id: asExitId('ex_1'),
          worldId: W,
          from: asLocationId('loc_missing'),
          to: asLocationId('loc_b'),
          direction: 'north' as never,
          label: 'n',
          locked: false,
          lockedByItem: null,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.ExitFromMissing);
  });

  it('reports ExitToMissing', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      exits: [
        {
          id: asExitId('ex_1'),
          worldId: W,
          from: asLocationId('loc_a'),
          to: asLocationId('loc_missing'),
          direction: 'north' as never,
          label: 'n',
          locked: false,
          lockedByItem: null,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.ExitToMissing);
  });

  it('reports ExitLockedByItemMissing', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      exits: [
        {
          id: asExitId('ex_1'),
          worldId: W,
          from: asLocationId('loc_a'),
          to: asLocationId('loc_b'),
          direction: 'north' as never,
          label: 'n',
          locked: true,
          lockedByItem: asItemId('item_missing'),
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.ExitLockedByItemMissing);
  });

  it('reports ItemOwnerMissing for a location owner', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      items: [
        {
          id: asItemId('item_x'),
          worldId: W,
          label: 'x',
          shortDescription: '',
          longDescription: '',
          owner: { kind: OwnerKind.Location, id: asLocationId('loc_missing') },
          weight: 1,
          hidden: false,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.ItemOwnerMissing);
  });

  it('reports AgentLocationMissing', () => {
    const t = baseTree();
    const [firstAgent] = t.agents;
    if (!firstAgent) throw new Error('baseTree must have an agent');
    const dirty: WorldTree = {
      ...t,
      agents: [
        {
          ...firstAgent,
          locationId: asLocationId('loc_missing'),
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.AgentLocationMissing);
  });

  it('reports PlayerAgentNotSet', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      summary: { ...t.summary, playerAgentId: null },
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.PlayerAgentNotSet);
  });

  it('reports PlayerAgentMissing', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      summary: { ...t.summary, playerAgentId: asAgentId('char_nope') },
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.PlayerAgentMissing);
  });

  it('reports DuplicateId', () => {
    const t = baseTree();
    const [firstLoc] = t.locations;
    if (!firstLoc) throw new Error('baseTree must have a location');
    const dirty: WorldTree = {
      ...t,
      locations: [...t.locations, { ...firstLoc }],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.DuplicateId);
  });
});
