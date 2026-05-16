import type { Agent, Item, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { asAgentId, asEventId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it, vi } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import {
  MAX_CONSEQUENCES_PER_PASS,
  consequencesFor,
  parseConsequenceResponse,
  resolveConsequenceTarget,
  resolveHiddenConsequenceItem,
  type ConsequenceContext,
} from './consequences';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = {
  id: A,
  worldId: W,
  label: 'Workshop',
  shortDescription: 'a workshop',
  longDescription: 'a tidy workshop full of tools',
  tags: [],
  secretDescription: '',
};
const lantern: Item = {
  id: asItemId('item_lantern'),
  worldId: W,
  label: 'lantern',
  shortDescription: 's',
  longDescription: 'l',
  owner: { kind: OwnerKind.Location, id: A },
  weight: 1,
  hidden: false,
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
  weaponDamage: null,
  armorDefense: null,
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
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  secretDescription: '',
};

const takeEvent: DomainEvent = {
  id: asEventId('e1'),
  worldId: W,
  actorId: paff.id,
  kind: EventKind.Take,
  witnesses: [paff.id],
  createdAt: new Date(),
  itemId: lantern.id,
  from: A,
};

const repoFor = (): MemoryRepository =>
  new MemoryRepository(W, {
    locations: [loc],
    exits: [],
    items: [lantern],
    agents: [paff],
  });

describe('consequencesFor', () => {
  it('returns [] when llm is null', async () => {
    const repo = repoFor();
    const r = await consequencesFor([takeEvent], repo, null);
    expect(r).toEqual([]);
  });

  it('returns [] for an empty event batch', async () => {
    const repo = repoFor();
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: '', parsed: { consequences: [] } }),
    });
    const r = await consequencesFor([], repo, llm);
    expect(r).toEqual([]);
  });

  it('resolves refs to ids and returns update_description actions', async () => {
    const repo = repoFor();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          consequences: [
            {
              kind: 'update_description',
              targetKind: 'location',
              targetRef: 'workshop',
              shortDescription: null,
              longDescription: 'an empty workshop, the lantern gone',
            },
          ],
        },
      }),
    });
    const r = await consequencesFor([takeEvent], repo, llm);
    expect(r).toHaveLength(1);
    const a = r[0];
    if (!a || a.kind !== ActionKind.UpdateDescription) throw new Error();
    expect(a.target.kind).toBe(OwnerKind.Location);
    expect(a.target.id).toBe(A);
    expect(a.longDescription).toBe('an empty workshop, the lantern gone');
    expect(a.shortDescription).toBeNull();
  });

  it('returns [] on a malformed response and warns', async () => {
    const repo = repoFor();
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const llm = makeFakeLanguageModel({
      responder: () => {
        throw new Error('boom');
      },
    });
    const r = await consequencesFor([takeEvent], repo, llm);
    expect(r).toEqual([]);
    const calls = warn.mock.calls;
    expect(calls.some((c) => String(c[0]).includes('[llm]'))).toBe(true);
    warn.mockRestore();
  });

  it('caps the returned list at MAX_CONSEQUENCES_PER_PASS', async () => {
    const repo = repoFor();
    const many = Array.from({ length: MAX_CONSEQUENCES_PER_PASS + 5 }, () => ({
      kind: 'update_description',
      targetKind: 'location',
      targetRef: 'workshop',
      shortDescription: null,
      longDescription: 'changed',
    }));
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: '', parsed: { consequences: many } }),
    });
    const r = await consequencesFor([takeEvent], repo, llm);
    expect(r.length).toBe(MAX_CONSEQUENCES_PER_PASS);
  });

  it('produces an update_description action carrying mood when the LLM sets it on an agent target', async () => {
    const repo = repoFor();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          consequences: [
            {
              kind: 'update_description',
              targetKind: 'agent',
              targetRef: 'Paff',
              shortDescription: null,
              longDescription: null,
              mood: 'wary',
              shortTermIntent: null,
            },
          ],
        },
      }),
    });
    const r = await consequencesFor([takeEvent], repo, llm);
    expect(r).toHaveLength(1);
    const a = r[0];
    if (!a || a.kind !== ActionKind.UpdateDescription) throw new Error();
    expect(a.target.kind).toBe(OwnerKind.Agent);
    expect(a.mood).toBe('wary');
    expect(a.shortTermIntent).toBeNull();
  });

  it('forces shortTermIntent to null even if the LLM emits one (agent owns intent)', async () => {
    // shortTermIntent is set/cleared by the agent's own NPC-mind reply, not
    // by the consequence engine. This is the hard guard: a consequence
    // emitting an intent string must be silently dropped, and on its own
    // it should not satisfy the "must change something" rule, so the
    // entire consequence is dropped if it has nothing else to change.
    const repo = repoFor();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          consequences: [
            {
              kind: 'update_description',
              targetKind: 'agent',
              targetRef: 'Paff',
              shortDescription: null,
              longDescription: null,
              mood: null,
              shortTermIntent: 'take the lantern to the docks',
            },
          ],
        },
      }),
    });
    const r = await consequencesFor([takeEvent], repo, llm);
    expect(r).toEqual([]);
  });

  it('mood-only consequence still applies (intent guard does not break mood path)', async () => {
    const repo = repoFor();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          consequences: [
            {
              kind: 'update_description',
              targetKind: 'agent',
              targetRef: 'Paff',
              shortDescription: null,
              longDescription: null,
              mood: 'thoughtful',
              shortTermIntent: 'this should be ignored',
            },
          ],
        },
      }),
    });
    const r = await consequencesFor([takeEvent], repo, llm);
    expect(r).toHaveLength(1);
    const a = r[0];
    if (!a || a.kind !== ActionKind.UpdateDescription) throw new Error();
    expect(a.mood).toBe('thoughtful');
    expect(a.shortTermIntent).toBeNull();
  });

  it('strips mood/shortTermIntent set on a non-agent target rather than rejecting', async () => {
    const repo = repoFor();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          consequences: [
            {
              kind: 'update_description',
              targetKind: 'location',
              targetRef: 'workshop',
              shortDescription: null,
              longDescription: 'an emptier workshop',
              mood: 'wary',
              shortTermIntent: 'something',
            },
          ],
        },
      }),
    });
    const r = await consequencesFor([takeEvent], repo, llm);
    expect(r).toHaveLength(1);
    const a = r[0];
    if (!a || a.kind !== ActionKind.UpdateDescription) throw new Error();
    expect(a.mood).toBeNull();
    expect(a.shortTermIntent).toBeNull();
  });

  it('writes updatedStorySoFar to world_lore when LLM returns one', async () => {
    const repo = repoFor();
    const builderRepo = new MemoryBuilderRepository();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          consequences: [],
          updatedStorySoFar: 'The cultist guildmaster has fallen.',
        },
      }),
    });
    await consequencesFor([takeEvent], repo, llm, { builderRepo, worldId: W });
    const lore = await builderRepo.readWorldLore(W);
    expect(lore.storySoFar).toBe('The cultist guildmaster has fallen.');
  });

  it('leaves storySoFar unchanged when updatedStorySoFar is null', async () => {
    const repo = repoFor();
    const builderRepo = new MemoryBuilderRepository();
    await builderRepo.writeWorldLore(W, { worldOverview: '', storySoFar: 'unchanged' });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: { consequences: [], updatedStorySoFar: null },
      }),
    });
    await consequencesFor([takeEvent], repo, llm, { builderRepo, worldId: W });
    const lore = await builderRepo.readWorldLore(W);
    expect(lore.storySoFar).toBe('unchanged');
  });

  it('drops entries with both descriptions null and unresolvable refs', async () => {
    const repo = repoFor();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          consequences: [
            {
              kind: 'update_description',
              targetKind: 'location',
              targetRef: 'workshop',
              shortDescription: null,
              longDescription: null,
            },
            {
              kind: 'update_description',
              targetKind: 'location',
              targetRef: 'somewhere else entirely',
              shortDescription: 'x',
              longDescription: null,
            },
          ],
        },
      }),
    });
    const r = await consequencesFor([takeEvent], repo, llm);
    expect(r).toEqual([]);
  });

  it('surfaces a location secretDescription in the user prompt; system prompt warns never to echo it', async () => {
    const secretLoc: Location = {
      ...loc,
      secretDescription:
        'The workshop has a false floorboard beneath the workbench. The Thieves Guild leaves messages there.',
    };
    const repoWithSecret = new MemoryRepository(W, {
      locations: [secretLoc],
      exits: [],
      items: [lantern],
      agents: [paff],
    });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: { consequences: [], updatedStorySoFar: null },
      }),
    });
    await consequencesFor([takeEvent], repoWithSecret, llm);
    expect(llm.calls).toHaveLength(1);
    const call = llm.calls[0];
    if (!call) throw new Error('expected call');
    expect(call.user).toContain('GM-only notes');
    expect(call.user).toContain('false floorboard');
    expect(call.system.toLowerCase()).toContain('gm-only');
    expect(call.system.toLowerCase()).toContain('never echo');
  });

  it('does NOT emit a GM-only line when the location has no secretDescription', async () => {
    const repo = repoFor();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: { consequences: [], updatedStorySoFar: null },
      }),
    });
    await consequencesFor([takeEvent], repo, llm);
    expect(llm.calls).toHaveLength(1);
    const call = llm.calls[0];
    if (!call) throw new Error('expected call');
    expect(call.user).not.toContain('GM-only notes');
  });

  describe('consequencesFor — creative_attack', () => {
    it('emits a creative_attack action when the LLM returns one', async () => {
      const repo = repoFor();
      const llm = makeFakeLanguageModel({
        responder: () => ({
          raw: '',
          parsed: {
            updatedStorySoFar: null,
            consequences: [
              {
                kind: 'creative_attack',
                actorRef: 'Paff',
                targetRef: 'Paff',
                toHit: { sides: 20, threshold: 1 },
                damage: { count: 1, sides: 6, bonus: 0 },
                narrative: 'Paff smashes the lantern overhead',
              },
            ],
          },
        }),
      });
      const actions = await consequencesFor([takeEvent], repo, llm);
      const ca = actions.find((a) => a.kind === ActionKind.CreativeAttack);
      expect(ca).toBeTruthy();
      if (!ca || ca.kind !== ActionKind.CreativeAttack) throw new Error();
      expect(ca.narrative).toBe('Paff smashes the lantern overhead');
      expect(ca.toHit).toEqual({ sides: 20, threshold: 1 });
      expect(ca.damage).toEqual({ count: 1, sides: 6, bonus: 0 });
    });

    it('drops malformed creative_attack consequences silently', async () => {
      const repo = repoFor();
      const llm = makeFakeLanguageModel({
        responder: () => ({
          raw: '',
          parsed: {
            updatedStorySoFar: null,
            consequences: [{ kind: 'creative_attack' }], // missing required fields
          },
        }),
      });
      const actions = await consequencesFor([takeEvent], repo, llm);
      expect(actions.filter((a) => a.kind === ActionKind.CreativeAttack)).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// parseConsequenceResponse — pure unit tests (no repo, no LLM)
// ---------------------------------------------------------------------------

describe('parseConsequenceResponse', () => {
  it('parses a valid update_description consequence', () => {
    const result = parseConsequenceResponse({
      consequences: [{
        kind: 'update_description',
        targetKind: 'location',
        targetRef: 'workshop',
        shortDescription: null,
        longDescription: 'scorched walls',
        mood: null,
        shortTermIntent: null,
      }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('update_description');
  });

  it('parses a reveal_item consequence', () => {
    const result = parseConsequenceResponse({ consequences: [{ kind: 'reveal_item', targetRef: 'key' }] });
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('reveal_item');
  });

  it('drops entries with missing required fields', () => {
    const result = parseConsequenceResponse({ consequences: [{ kind: 'update_description', targetKind: 'location' }] });
    expect(result).toHaveLength(0);
  });

  it('returns [] for non-object input', () => {
    expect(parseConsequenceResponse(null)).toEqual([]);
    expect(parseConsequenceResponse('bad')).toEqual([]);
    expect(parseConsequenceResponse([])).toEqual([]);
  });

  it('returns [] when consequences array is absent', () => {
    expect(parseConsequenceResponse({})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveConsequenceTarget / resolveHiddenConsequenceItem — pure unit tests
// ---------------------------------------------------------------------------

const CTX_LOC = asLocationId('loc_a');
const CTX_ITEM_ID = asItemId('item_lantern');
const CTX_AGENT_ID = asAgentId('char_p');

const makeCtx = (overrides: Partial<ConsequenceContext> = {}): ConsequenceContext => ({
  locations: [{ id: CTX_LOC, worldId: asWorldId('w'), label: 'Workshop', shortDescription: '', longDescription: '', tags: [], secretDescription: '' }],
  items: [{ id: CTX_ITEM_ID, worldId: asWorldId('w'), label: 'lantern', shortDescription: '', longDescription: '', owner: { kind: OwnerKind.Location, id: CTX_LOC }, weight: 1, hidden: false, tags: [], equipped: false, container: false, opened: true, locked: false, lockedByItem: null, priceTag: null, weaponDamage: null, armorDefense: null }],
  agents: [{ id: CTX_AGENT_ID, worldId: asWorldId('w'), label: 'Paff', shortDescription: '', longDescription: '', locationId: CTX_LOC, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, shortTermIntent: null, goal: null, autonomous: false, awake: false, gold: 0, tags: [], secretDescription: '' }],
  hiddenItems: [],
  ...overrides,
});

const descRaw = (targetKind: 'location' | 'item' | 'agent', targetRef: string) => ({
  kind: 'update_description' as const,
  targetKind,
  targetRef,
  shortDescription: null,
  longDescription: 'changed',
  mood: null,
  shortTermIntent: null,
});

describe('resolveConsequenceTarget', () => {
  it('resolves a location by exact label match', () => {
    const t = resolveConsequenceTarget(descRaw('location', 'Workshop'), makeCtx());
    expect(t).toEqual({ kind: OwnerKind.Location, id: CTX_LOC });
  });

  it('resolves a location by partial label match (case-insensitive)', () => {
    const t = resolveConsequenceTarget(descRaw('location', 'workshop'), makeCtx());
    expect(t).toEqual({ kind: OwnerKind.Location, id: CTX_LOC });
  });

  it('returns null for an unknown location ref', () => {
    const t = resolveConsequenceTarget(descRaw('location', 'nowhere'), makeCtx());
    expect(t).toBeNull();
  });

  it('resolves an item ref', () => {
    const t = resolveConsequenceTarget(descRaw('item', 'lantern'), makeCtx());
    expect(t).toEqual({ kind: OwnerKind.Item, id: CTX_ITEM_ID });
  });

  it('resolves an agent ref', () => {
    const t = resolveConsequenceTarget(descRaw('agent', 'Paff'), makeCtx());
    expect(t).toEqual({ kind: OwnerKind.Agent, id: CTX_AGENT_ID });
  });
});

describe('resolveHiddenConsequenceItem', () => {
  it('returns null when there are no hidden items', () => {
    expect(resolveHiddenConsequenceItem('key', makeCtx())).toBeNull();
  });

  it('finds a hidden item by label', () => {
    const key: Item = { id: asItemId('item_key'), worldId: asWorldId('w'), label: 'brass key', shortDescription: '', longDescription: '', owner: { kind: OwnerKind.Location, id: CTX_LOC }, weight: 0, hidden: true, tags: [], equipped: false, container: false, opened: false, locked: false, lockedByItem: null, priceTag: null, weaponDamage: null, armorDefense: null };
    const result = resolveHiddenConsequenceItem('brass key', makeCtx({ hiddenItems: [key] }));
    expect(result?.id).toBe(key.id);
  });

  it('returns null for a ref that does not match any hidden item', () => {
    const key: Item = { id: asItemId('item_key'), worldId: asWorldId('w'), label: 'brass key', shortDescription: '', longDescription: '', owner: { kind: OwnerKind.Location, id: CTX_LOC }, weight: 0, hidden: true, tags: [], equipped: false, container: false, opened: false, locked: false, lockedByItem: null, priceTag: null, weaponDamage: null, armorDefense: null };
    expect(resolveHiddenConsequenceItem('gold coin', makeCtx({ hiddenItems: [key] }))).toBeNull();
  });
});
