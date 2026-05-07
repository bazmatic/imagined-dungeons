import type { Agent, Item, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { asAgentId, asEventId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it, vi } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { MAX_CONSEQUENCES_PER_PASS, consequencesFor } from './consequences';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = {
  id: A,
  worldId: W,
  label: 'Workshop',
  shortDescription: 'a workshop',
  longDescription: 'a tidy workshop full of tools',
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('produces an update_description action carrying shortTermIntent when the LLM sets it', async () => {
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
    expect(r).toHaveLength(1);
    const a = r[0];
    if (!a || a.kind !== ActionKind.UpdateDescription) throw new Error();
    expect(a.shortTermIntent).toBe('take the lantern to the docks');
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
});
