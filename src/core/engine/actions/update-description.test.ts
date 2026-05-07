import type { Agent, Item, Location } from '@core/domain/entities';
import { SYSTEM_AGENT_ID, asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleUpdateDescription } from './update-description';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: 'short A',
  longDescription: 'long A',
};
const lantern: Item = {
  id: asItemId('item_lantern'),
  worldId: W,
  label: 'lantern',
  shortDescription: 'short lantern',
  longDescription: 'long lantern',
  owner: { kind: OwnerKind.Location, id: A },
  weight: 1,
  hidden: false,
};
const paff: Agent = {
  id: asAgentId('char_p'),
  worldId: W,
  label: 'Paff',
  shortDescription: 'short paff',
  longDescription: 'long paff',
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
  goal: null,
  autonomous: true,
};

describe('handleUpdateDescription', () => {
  it("updates a location's long description and emits a description_updated event with before/after", async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [paff, spark],
    });
    const r = await handleUpdateDescription(
      {
        kind: ActionKind.UpdateDescription,
        actorId: SYSTEM_AGENT_ID,
        target: { kind: OwnerKind.Location, id: A },
        shortDescription: null,
        longDescription: 'long A, now scorched',
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const updated = await repo.getLocation(A);
    expect(updated.longDescription).toBe('long A, now scorched');
    expect(updated.shortDescription).toBe('short A');
    expect(r.value.event.kind).toBe(EventKind.DescriptionUpdated);
    if (r.value.event.kind !== EventKind.DescriptionUpdated) throw new Error();
    expect(r.value.event.longBefore).toBe('long A');
    expect(r.value.event.longAfter).toBe('long A, now scorched');
    expect(r.value.event.shortBefore).toBe('short A');
    expect(r.value.event.shortAfter).toBe('short A');
    // Witnesses include everyone in the affected location at time of the change.
    const ws = new Set(r.value.event.witnesses.map((w) => w as string));
    expect(ws.has(paff.id as string)).toBe(true);
    expect(ws.has(spark.id as string)).toBe(true);
  });

  it('returns an error when both descriptions are null', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [paff],
    });
    const r = await handleUpdateDescription(
      {
        kind: ActionKind.UpdateDescription,
        actorId: SYSTEM_AGENT_ID,
        target: { kind: OwnerKind.Location, id: A },
        shortDescription: null,
        longDescription: null,
      },
      repo,
    );
    expect(r.ok).toBe(false);
  });

  it('updates an item description; witnesses are agents at the item location', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [lantern],
      agents: [paff, spark],
    });
    const r = await handleUpdateDescription(
      {
        kind: ActionKind.UpdateDescription,
        actorId: SYSTEM_AGENT_ID,
        target: { kind: OwnerKind.Item, id: lantern.id },
        shortDescription: 'a soot-stained lantern',
        longDescription: null,
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const item = await repo.getItem(lantern.id);
    expect(item.shortDescription).toBe('a soot-stained lantern');
    expect(item.longDescription).toBe('long lantern');
    expect(r.value.event.witnesses).toHaveLength(2);
  });

  it("updates an agent's description; witnesses are agents at the agent's location", async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [paff, spark],
    });
    const r = await handleUpdateDescription(
      {
        kind: ActionKind.UpdateDescription,
        actorId: SYSTEM_AGENT_ID,
        target: { kind: OwnerKind.Agent, id: spark.id },
        shortDescription: null,
        longDescription: 'visibly wounded',
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const a = await repo.getAgent(spark.id);
    expect(a.longDescription).toBe('visibly wounded');
  });
});
