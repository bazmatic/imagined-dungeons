import type { WorldTree } from '@core/domain/builder-types';
import type {
  AgentId,
  ItemId,
  LocationId,
  MonsterTemplateId,
  TagLoreId,
  WorldId,
} from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { describe, expect, it } from 'vitest';
import { collectLoreTags } from './lore-helpers';

const W = 'w' as WorldId;

function makeTree(partial: Partial<WorldTree>): WorldTree {
  return {
    summary: {
      id: W,
      kind: 'draft',
      label: 'W',
      displayName: 'W',
      parentDraftId: null,
      playerAgentId: null,
      coverImageUrl: null,
    } as unknown as WorldTree['summary'],
    locations: [],
    exits: [],
    items: [],
    agents: [],
    templates: [],
    triggers: [],
    worldLore: { worldId: W, worldOverview: '', storySoFar: '' },
    tagLore: [],
    ...partial,
  };
}

describe('collectLoreTags', () => {
  it('unions tags from all entity types and TagLore, deduped and sorted', () => {
    const tree = makeTree({
      locations: [
        {
          id: 'l1' as LocationId,
          worldId: W,
          label: 'L1',
          shortDescription: '',
          longDescription: '',
          tags: ['forest', 'wet'],
        },
      ],
      items: [
        {
          id: 'i1' as ItemId,
          worldId: W,
          label: 'I1',
          shortDescription: '',
          longDescription: '',
          owner: { kind: OwnerKind.Location, id: 'l1' as LocationId },
          weight: 1,
          hidden: false,
          tags: ['cursed', 'wet'],
        },
      ],
      agents: [
        {
          id: 'a1' as AgentId,
          worldId: W,
          label: 'A1',
          shortDescription: '',
          longDescription: '',
          locationId: 'l1' as LocationId,
          hp: 1,
          damage: 1,
          defense: 0,
          capacity: 1,
          mood: null,
          goal: null,
          autonomous: false,
          shortTermIntent: null,
          awake: false,
          tags: ['cult'],
        },
      ],
      templates: [
        {
          id: 't1' as MonsterTemplateId,
          worldId: W,
          templateKey: 't1',
          label: 'T1',
          shortDescription: '',
          longDescription: '',
          hp: 1,
          mood: null,
          startingItems: [],
          tags: ['forest'],
        },
      ],
      tagLore: [
        {
          id: 'tlr_x' as TagLoreId,
          worldId: W,
          tag: 'orphan',
          title: '',
          description: '',
        },
      ],
    });
    expect(collectLoreTags(tree)).toEqual(['cult', 'cursed', 'forest', 'orphan', 'wet']);
  });
});
