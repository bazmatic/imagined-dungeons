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
  tags: [],
  secretDescription: '',
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
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
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
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
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
  autonomous: true,
  awake: true,
  gold: 0,
  tags: [],
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
        mood: null,
        shortTermIntent: null,
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
        mood: null,
        shortTermIntent: null,
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
        mood: null,
        shortTermIntent: null,
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
        mood: null,
        shortTermIntent: null,
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const a = await repo.getAgent(spark.id);
    expect(a.longDescription).toBe('visibly wounded');
  });

  it("updates an agent's mood and emits moodBefore/moodAfter on the event", async () => {
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
        longDescription: null,
        mood: 'wary',
        shortTermIntent: null,
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const a = await repo.getAgent(spark.id);
    expect(a.mood).toBe('wary');
    if (r.value.event.kind !== EventKind.DescriptionUpdated) throw new Error();
    expect(r.value.event.moodBefore).toBeNull();
    expect(r.value.event.moodAfter).toBe('wary');
    expect(r.value.event.shortTermIntentBefore).toBeNull();
    expect(r.value.event.shortTermIntentAfter).toBeNull();
  });

  it("updates an agent's shortTermIntent and emits shortTermIntent before/after", async () => {
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
        longDescription: null,
        mood: null,
        shortTermIntent: 'take the fire map to the docks',
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const a = await repo.getAgent(spark.id);
    expect(a.shortTermIntent).toBe('take the fire map to the docks');
    if (r.value.event.kind !== EventKind.DescriptionUpdated) throw new Error();
    expect(r.value.event.shortTermIntentBefore).toBeNull();
    expect(r.value.event.shortTermIntentAfter).toBe('take the fire map to the docks');
  });

  it('updates mood and shortTermIntent at once', async () => {
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
        longDescription: null,
        mood: 'angry',
        shortTermIntent: 'find Paff',
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const a = await repo.getAgent(spark.id);
    expect(a.mood).toBe('angry');
    expect(a.shortTermIntent).toBe('find Paff');
  });

  it('passing null for mood is a no-op even if shortDescription is provided', async () => {
    const sparkWithMood: Agent = { ...spark, mood: 'energetic' };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [paff, sparkWithMood],
    });
    const r = await handleUpdateDescription(
      {
        kind: ActionKind.UpdateDescription,
        actorId: SYSTEM_AGENT_ID,
        target: { kind: OwnerKind.Agent, id: spark.id },
        shortDescription: 'a halfling, a bit singed',
        longDescription: null,
        mood: null,
        shortTermIntent: null,
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const a = await repo.getAgent(spark.id);
    expect(a.shortDescription).toBe('a halfling, a bit singed');
    expect(a.mood).toBe('energetic'); // untouched
  });

  it('passing "" for mood clears the mood', async () => {
    const sparkWithMood: Agent = { ...spark, mood: 'energetic' };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [paff, sparkWithMood],
    });
    const r = await handleUpdateDescription(
      {
        kind: ActionKind.UpdateDescription,
        actorId: SYSTEM_AGENT_ID,
        target: { kind: OwnerKind.Agent, id: spark.id },
        shortDescription: null,
        longDescription: null,
        mood: '',
        shortTermIntent: null,
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const a = await repo.getAgent(spark.id);
    expect(a.mood).toBeNull();
    if (r.value.event.kind !== EventKind.DescriptionUpdated) throw new Error();
    expect(r.value.event.moodBefore).toBe('energetic');
    expect(r.value.event.moodAfter).toBeNull();
  });

  it('passing "" for shortTermIntent clears the intent', async () => {
    const sparkWithIntent: Agent = {
      ...spark,
      shortTermIntent: 'take the map',
    };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [paff, sparkWithIntent],
    });
    const r = await handleUpdateDescription(
      {
        kind: ActionKind.UpdateDescription,
        actorId: SYSTEM_AGENT_ID,
        target: { kind: OwnerKind.Agent, id: spark.id },
        shortDescription: null,
        longDescription: null,
        mood: null,
        shortTermIntent: '',
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    const a = await repo.getAgent(spark.id);
    expect(a.shortTermIntent).toBeNull();
  });

  it('mood/shortTermIntent set on a non-agent target are silently ignored', async () => {
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
        shortDescription: 'a workshop, slightly redder',
        longDescription: null,
        mood: 'wary',
        shortTermIntent: 'find the goblin',
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== EventKind.DescriptionUpdated) throw new Error();
    expect(r.value.event.moodBefore).toBeNull();
    expect(r.value.event.moodAfter).toBeNull();
    expect(r.value.event.shortTermIntentBefore).toBeNull();
    expect(r.value.event.shortTermIntentAfter).toBeNull();
  });
});
