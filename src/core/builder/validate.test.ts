import { ProblemKind, TriggerEventKind, WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asTagLoreId,
  asWorldId,
} from '@core/domain/ids';
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
    coverImageUrl: null,
  },
  locations: [
    {
      id: asLocationId('loc_a'),
      worldId: W,
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
      tags: [],
      secretDescription: '',
    },
    {
      id: asLocationId('loc_b'),
      worldId: W,
      label: 'B',
      shortDescription: 'b',
      longDescription: 'b',
      tags: [],
      secretDescription: '',
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
      gold: 0,
      tags: [],
      secretDescription: '',
    },
  ],
  templates: [],
  triggers: [],
  worldLore: { worldId: W, worldOverview: '', storySoFar: '' },
  tagLore: [],
});

const baseTemplate = (id = 'tpl_goblin') => ({
  id: asMonsterTemplateId(id),
  worldId: W,
  templateKey: 'goblin',
  label: 'goblin',
  labelPrefixInstructions: null,
  shortDescription: 'a goblin',
  longDescription: 'a small goblin',
  hpMin: 3,
  hpMax: 5,
  damageMin: 1,
  damageMax: 4,
  defenseMin: 0,
  defenseMax: 2,
  mood: null,
  startingItems: [],
  tags: [],
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
          tags: [],
          equipped: false,
          container: false,
          opened: true,
          locked: false,
          lockedByItem: null,
          priceTag: null,
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

  it('reports TemplateLabelEmpty', () => {
    const t = baseTree();
    const dirty = { ...t, templates: [{ ...baseTemplate(), label: '' }] };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.TemplateLabelEmpty);
  });

  it('reports TemplateHpInvalid', () => {
    const t = baseTree();
    const dirty = { ...t, templates: [{ ...baseTemplate(), hpMin: 0 }] };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.TemplateHpInvalid);
  });

  it('reports TemplateStartingItemMissing for an empty starter-pack inline label', () => {
    const t = baseTree();
    const dirty = {
      ...t,
      templates: [
        {
          ...baseTemplate(),
          startingItems: [
            {
              kind: 'inline' as const,
              label: '',
              shortDescription: '',
              longDescription: '',
              weight: 0,
              hidden: false,
            },
          ],
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(
      ProblemKind.TemplateStartingItemMissing,
    );
  });

  it('reports LocationSpawnTriggerTemplateMissing', () => {
    const t = baseTree();
    const dirty = {
      ...t,
      triggers: [
        {
          id: asSpawnTriggerId('trg_1'),
          worldId: W,
          locationId: asLocationId('loc_a'),
          templateId: asMonsterTemplateId('tpl_missing'),
          params: { kind: TriggerEventKind.PlayerEnters },
          count: 1,
          oneShot: false,
          fireOnInitialPublish: false,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(
      ProblemKind.LocationSpawnTriggerTemplateMissing,
    );
  });

  it('reports LocationSpawnTriggerLocationMissing', () => {
    const t = baseTree();
    const dirty = {
      ...t,
      templates: [baseTemplate()],
      triggers: [
        {
          id: asSpawnTriggerId('trg_1'),
          worldId: W,
          locationId: asLocationId('loc_missing'),
          templateId: asMonsterTemplateId('tpl_goblin'),
          params: { kind: TriggerEventKind.PlayerEnters },
          count: 1,
          oneShot: false,
          fireOnInitialPublish: false,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(
      ProblemKind.LocationSpawnTriggerLocationMissing,
    );
  });

  it('reports LocationSpawnTriggerCountInvalid for count < 1', () => {
    const t = baseTree();
    const dirty = {
      ...t,
      templates: [baseTemplate()],
      triggers: [
        {
          id: asSpawnTriggerId('trg_1'),
          worldId: W,
          locationId: asLocationId('loc_a'),
          templateId: asMonsterTemplateId('tpl_goblin'),
          params: { kind: TriggerEventKind.PlayerEnters },
          count: 0,
          oneShot: false,
          fireOnInitialPublish: false,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(
      ProblemKind.LocationSpawnTriggerCountInvalid,
    );
  });

  it('reports LocationSpawnTriggerParamsInvalid when LlmJudgement lacks predicate', () => {
    const t = baseTree();
    const dirty = {
      ...t,
      templates: [baseTemplate()],
      triggers: [
        {
          id: asSpawnTriggerId('trg_1'),
          worldId: W,
          locationId: asLocationId('loc_a'),
          templateId: asMonsterTemplateId('tpl_goblin'),
          params: { kind: TriggerEventKind.LlmJudgement } as never,
          count: 1,
          oneShot: false,
          fireOnInitialPublish: false,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(
      ProblemKind.LocationSpawnTriggerParamsInvalid,
    );
  });

  it('reports LocationSpawnTriggerParamsInvalid when Speech lacks phrase', () => {
    const t = baseTree();
    const dirty = {
      ...t,
      templates: [baseTemplate()],
      triggers: [
        {
          id: asSpawnTriggerId('trg_1'),
          worldId: W,
          locationId: asLocationId('loc_a'),
          templateId: asMonsterTemplateId('tpl_goblin'),
          params: { kind: TriggerEventKind.Speech } as never,
          count: 1,
          oneShot: false,
          fireOnInitialPublish: false,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(
      ProblemKind.LocationSpawnTriggerParamsInvalid,
    );
  });

  it('reports TagLoreTagEmpty for an empty tag', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      tagLore: [
        {
          id: asTagLoreId('tlr_a'),
          worldId: W,
          tag: '',
          title: 'untitled',
          description: 'desc',
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.TagLoreTagEmpty);
  });

  it('reports TagLoreTagEmpty for a whitespace-only tag', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      tagLore: [
        {
          id: asTagLoreId('tlr_a'),
          worldId: W,
          tag: '   ',
          title: 'untitled',
          description: 'desc',
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.TagLoreTagEmpty);
  });

  it('reports TagLoreDuplicate when two rows share a tag', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      tagLore: [
        {
          id: asTagLoreId('tlr_a'),
          worldId: W,
          tag: 'cult',
          title: 'A',
          description: 'one',
        },
        {
          id: asTagLoreId('tlr_b'),
          worldId: W,
          tag: 'cult',
          title: 'B',
          description: 'two',
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.TagLoreDuplicate);
  });

  it('does not report TagLoreDuplicate when tags are distinct', () => {
    const t = baseTree();
    const clean: WorldTree = {
      ...t,
      tagLore: [
        {
          id: asTagLoreId('tlr_a'),
          worldId: W,
          tag: 'cult',
          title: 'Cult',
          description: 'one',
        },
        {
          id: asTagLoreId('tlr_b'),
          worldId: W,
          tag: 'sewer',
          title: 'Sewer',
          description: 'two',
        },
      ],
    };
    expect(validateWorld(clean).map((p) => p.kind)).not.toContain(ProblemKind.TagLoreDuplicate);
    expect(validateWorld(clean).map((p) => p.kind)).not.toContain(ProblemKind.TagLoreTagEmpty);
  });
});
