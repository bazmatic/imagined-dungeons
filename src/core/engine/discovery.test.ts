import { DiscoverySubjectKind, DiscoveryTriggerKind } from '@core/domain/builder-kinds';
import type { DiscoveryRequest } from '@core/domain/builder-types';
import type { Agent, Item } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { describe, expect, it, vi } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { runDiscovery } from './discovery';

const W = asWorldId('w');
const LOC = asLocationId('loc_a');
const ACTOR = asAgentId('char_player');

const lantern: Item = {
  id: asItemId('item_lantern'),
  worldId: W,
  label: 'lantern',
  shortDescription: 'a brass lantern',
  longDescription: 'an old brass lantern with a cracked glass pane',
  owner: { kind: OwnerKind.Location, id: LOC },
  weight: 1,
  hidden: false,
  tags: [],
  equipped: false,
};

const guard: Agent = {
  id: asAgentId('char_guard'),
  worldId: W,
  label: 'guard',
  shortDescription: 'a stern guard',
  longDescription: 'a stern guard in dented mail',
  locationId: LOC,
  hp: 10,
  damage: 0,
  defense: 0,
  capacity: 10,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: true,
  tags: [],
};

const baseReq = (): DiscoveryRequest => ({
  trigger: DiscoveryTriggerKind.Search,
  actorId: ACTOR,
  locationId: LOC,
  query: 'look around carefully',
  subject: null,
  loreContext: {
    worldOverview: 'A grim citadel.',
    storySoFar: 'The hero arrives.',
    tagDescriptions: { dusty: 'These things are dusty.' },
  },
  visibleItems: [lantern],
  visibleAgents: [guard],
  undiscoveredItems: [],
});

describe('runDiscovery', () => {
  it('round-trips flavour-only narration (all optional fields null)', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'You find dust and silence.',
          matchedItemId: null,
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent: null,
        },
      }),
    });
    const out = await runDiscovery(baseReq(), llm);
    expect(out.narration).toBe('You find dust and silence.');
    expect(out.matchedItemId).toBeNull();
    expect(out.matchedAgentId).toBeNull();
    expect(out.spawnedItem).toBeNull();
    expect(out.spawnedAgent).toBeNull();
  });

  it('round-trips a spawnedItem when LLM produces one', async () => {
    const spawnedItem = {
      id: 'item_new',
      label: 'rusted key',
      shortDescription: 'a rusted key',
      longDescription: 'a rusted iron key, edges crumbling',
      ownerKind: OwnerKind.Location,
      ownerId: LOC,
      weight: 1,
      hidden: false,
      tags: [],
    };
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'Tucked behind a stone, you find a rusted key.',
          matchedItemId: null,
          matchedAgentId: null,
          spawnedItem,
          spawnedAgent: null,
        },
      }),
    });
    const out = await runDiscovery(baseReq(), llm);
    expect(out.spawnedItem?.label).toBe('rusted key');
  });

  it('round-trips a spawnedAgent when LLM produces one', async () => {
    const spawnedAgent = {
      id: 'char_new',
      label: 'shadowy figure',
      shortDescription: 'a shadowy figure',
      longDescription: 'a shadowy figure half-hidden in the gloom',
      locationId: LOC,
      hp: 5,
      damage: 1,
      defense: 0,
      capacity: 3,
      mood: 'wary',
      goal: null,
      autonomous: false,
      tags: [],
    };
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'A shadowy figure steps from a doorway.',
          matchedItemId: null,
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent,
        },
      }),
    });
    const out = await runDiscovery(baseReq(), llm);
    expect(out.spawnedAgent?.label).toBe('shadowy figure');
  });

  it('round-trips matchedItemId without validating it against visible list', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: '',
          matchedItemId: 'item_lantern',
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent: null,
        },
      }),
    });
    const out = await runDiscovery(baseReq(), llm);
    expect(out.matchedItemId).toBe('item_lantern');
  });

  it('falls back to generic narration when LLM throws', async () => {
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const llm = makeFakeLanguageModel({
      responder: () => {
        throw new Error('network');
      },
    });
    const out = await runDiscovery(baseReq(), llm);
    expect(out.narration).toMatch(/nothing of note/i);
    expect(out.matchedItemId).toBeNull();
    expect(out.matchedAgentId).toBeNull();
    expect(out.spawnedItem).toBeNull();
    expect(out.spawnedAgent).toBeNull();
    warn.mockRestore();
  });

  it('system prompt mentions match, spawn, and narration', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'x',
          matchedItemId: null,
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent: null,
        },
      }),
    });
    await runDiscovery(baseReq(), llm);
    const sys = llm.calls.at(-1)?.system ?? '';
    expect(sys.toLowerCase()).toMatch(/match/);
    expect(sys.toLowerCase()).toMatch(/spawn/);
    expect(sys.toLowerCase()).toMatch(/narrat/);
  });

  it("includes subject's label and long description in the user prompt when subject is non-null", async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'x',
          matchedItemId: null,
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent: null,
        },
      }),
    });
    const req: DiscoveryRequest = {
      ...baseReq(),
      subject: {
        kind: DiscoverySubjectKind.Item,
        label: 'iron chest',
        shortDescription: 'a heavy iron chest',
        longDescription: 'a heavy iron chest, cold to the touch',
      },
    };
    await runDiscovery(req, llm);
    const user = llm.calls.at(-1)?.user ?? '';
    expect(user).toContain('iron chest');
    expect(user).toContain('cold to the touch');
  });

  it('DISCOVERY_SCHEMA is OpenAI-strict-mode compliant', async () => {
    const { DISCOVERY_SCHEMA } = await import('./discovery');
    // Strict mode requires: every object node has additionalProperties: false,
    // and every key in `properties` also appears in `required`.
    const check = (node: unknown, path: string): void => {
      if (typeof node !== 'object' || node === null) return;
      const n = node as Record<string, unknown>;
      const type = n.type;
      const isObjectType =
        type === 'object' ||
        (Array.isArray(type) && (type as readonly unknown[]).includes('object'));
      if (isObjectType) {
        expect(n.additionalProperties, `${path}.additionalProperties`).toBe(false);
        const props = (n.properties ?? {}) as Record<string, unknown>;
        const required = (n.required ?? []) as readonly string[];
        for (const key of Object.keys(props)) {
          expect(required, `${path}.required missing ${key}`).toContain(key);
          check(props[key], `${path}.properties.${key}`);
        }
      }
      if (n.items !== undefined) check(n.items, `${path}.items`);
    };
    check(DISCOVERY_SCHEMA, '$');
  });
});
