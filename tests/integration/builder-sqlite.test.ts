import {
  cloneLiveAsDraft,
  createDraft,
  publish,
  upsertAgent,
  upsertExit,
  upsertItem,
  upsertLocation,
} from '@core/builder/index';
import { asAgentId, asExitId, asItemId, asLocationId } from '@core/domain/ids';
import { Direction, OwnerKind } from '@core/domain/kinds';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { type DbHandle, openDb } from '@infra/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let handle: DbHandle;
let repo: SqliteBuilderRepository;

beforeEach(() => {
  handle = openDb(':memory:');
  repo = new SqliteBuilderRepository(handle.db);
});
afterEach(() => handle.close());

describe('SqliteBuilderRepository (via builder facade)', () => {
  it('round-trips a draft → publish → clone cycle', async () => {
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error();
    const W = created.value;
    await upsertLocation(repo, W, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: '',
      longDescription: '',
      tags: [],
    });
    await upsertAgent(repo, W, {
      id: asAgentId('char_p'),
      label: 'P',
      shortDescription: '',
      longDescription: '',
      locationId: asLocationId('loc_a'),
      hp: 10,
      damage: 0,
      defense: 0,
      capacity: 10,
      mood: null,
      goal: null,
      autonomous: false,
      tags: [],
    });
    await repo.updateWorldSummary(W, { playerAgentId: asAgentId('char_p') });
    const pub = await publish(repo, W);
    expect(pub.ok).toBe(true);
    if (pub.ok) {
      const cloned = await cloneLiveAsDraft(repo, pub.value.liveWorldId);
      expect(cloned.ok).toBe(true);
    }
  });

  it('cloneLiveAsDraft populates the new draft with copies of the live entities', async () => {
    // 1. Seed a draft with location + second location + exit + item + agent
    const created = await createDraft(repo, { displayName: 'Seeded', label: 'Seeded' });
    if (!created.ok) throw new Error('createDraft failed');
    const draft = created.value;

    await upsertLocation(repo, draft, {
      id: asLocationId('loc_kitchen'),
      label: 'Kitchen',
      shortDescription: 'k',
      longDescription: 'kitchen',
      tags: [],
    });
    await upsertLocation(repo, draft, {
      id: asLocationId('loc_pantry'),
      label: 'Pantry',
      shortDescription: 'p',
      longDescription: 'pantry',
      tags: [],
    });
    await upsertExit(repo, draft, {
      id: asExitId('exit_kitchen_pantry'),
      from: asLocationId('loc_kitchen'),
      to: asLocationId('loc_pantry'),
      direction: Direction.North,
      label: 'door',
      locked: false,
      lockedByItem: null,
    });
    await upsertItem(repo, draft, {
      id: asItemId('item_knife'),
      label: 'knife',
      shortDescription: 'a knife',
      longDescription: 'a sharp knife',
      ownerKind: OwnerKind.Location,
      ownerId: 'loc_kitchen',
      weight: 1,
      hidden: false,
      tags: [],
    });
    await upsertAgent(repo, draft, {
      id: asAgentId('char_serena'),
      label: 'Serena',
      shortDescription: 's',
      longDescription: 'serena',
      locationId: asLocationId('loc_kitchen'),
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 10,
      mood: null,
      goal: null,
      autonomous: false,
      tags: [],
    });
    await repo.updateWorldSummary(draft, { playerAgentId: asAgentId('char_serena') });

    // 2. Publish creates the live world
    const pub = await publish(repo, draft);
    if (!pub.ok) throw new Error(`publish failed: ${JSON.stringify(pub.error)}`);
    const live = pub.value.liveWorldId;

    // Sanity-check the live world has all the rows
    const liveLocations = await repo.listLocations(live);
    const liveExits = await repo.listExits(live);
    const liveItems = await repo.listItems(live);
    const liveAgents = await repo.listAgents(live);
    expect(liveLocations).toHaveLength(2);
    expect(liveExits).toHaveLength(1);
    expect(liveItems).toHaveLength(1);
    expect(liveAgents).toHaveLength(1);

    // 3. Clone the live world as a new draft
    const cloned = await cloneLiveAsDraft(repo, live);
    if (!cloned.ok) throw new Error(`clone failed: ${JSON.stringify(cloned.error)}`);
    const newDraft = cloned.value;

    // 4. The cloned draft must have the same entities as the live world
    const newDraftLocations = await repo.listLocations(newDraft);
    const newDraftExits = await repo.listExits(newDraft);
    const newDraftItems = await repo.listItems(newDraft);
    const newDraftAgents = await repo.listAgents(newDraft);
    expect(newDraftLocations).toHaveLength(liveLocations.length);
    expect(newDraftExits).toHaveLength(liveExits.length);
    expect(newDraftItems).toHaveLength(liveItems.length);
    expect(newDraftAgents).toHaveLength(liveAgents.length);

    // 5. Live world still intact (didn't get cannibalised)
    const liveLocationsAfter = await repo.listLocations(live);
    const liveAgentsAfter = await repo.listAgents(live);
    expect(liveLocationsAfter).toHaveLength(2);
    expect(liveAgentsAfter).toHaveLength(1);
  });
});
