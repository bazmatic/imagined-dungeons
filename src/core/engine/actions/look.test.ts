import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { Direction } from '@core/domain/kinds';
import { SegmentKind } from '@core/domain/segments';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it, vi } from 'vitest';
import { nullGameAI } from '../game-ai';
import { ExaminableKind } from '@core/domain/kinds';
import { handleLook } from './look';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = {
  id: A,
  worldId: W,
  label: 'The Goblet',
  shortDescription: 's',
  longDescription: 'A tavern.',
  tags: [],
  secretDescription: '',
};
const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: 's',
  longDescription: 'A real-time map.',
  owner: { kind: 'location', id: A },
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

const B = asLocationId('loc_b');
const locB: Location = {
  id: B,
  worldId: W,
  label: 'Merchant Quarter',
  shortDescription: 'A busy trading district.',
  longDescription: 'Canvas stalls line every wall.',
  tags: [],
  secretDescription: '',
};
const unlockedExit: Exit = {
  id: asExitId('exit_north'),
  worldId: W,
  from: A,
  to: B,
  direction: Direction.North,
  label: 'oak door',
  locked: false,
  lockedByItem: null,
};
const lockedExit: Exit = {
  id: asExitId('exit_south'),
  worldId: W,
  from: A,
  to: B,
  direction: Direction.South,
  label: 'iron gate',
  locked: true,
  lockedByItem: null,
};
const nullDestExit: Exit = {
  id: asExitId('exit_east'),
  worldId: W,
  from: A,
  to: null,
  direction: Direction.East,
  label: 'dark passage',
  locked: false,
  lockedByItem: null,
};

describe('handleLook', () => {
  it('with no target, returns the room view', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [map],
      agents: [paff],
    });
    const r = await handleLook({ kind: 'look', actorId: paff.id, target: { kind: 'room' } }, repo);
    if (!r.ok) throw new Error();
    expect(r.value.render[0]).toEqual({ kind: SegmentKind.LocationName, text: 'The Goblet' });
    expect(r.value.render.some((s) => s.text.includes('A tavern.'))).toBe(true);
    expect(r.value.render.some((s) => s.text.includes('fire map'))).toBe(true);
  });

  it('with a resolved item id, returns its long description', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [map],
      agents: [paff],
    });
    const r = await handleLook(
      { kind: 'look', actorId: paff.id, target: { kind: 'item', id: map.id } },
      repo,
    );
    if (!r.ok) throw new Error();
    expect(r.value.render).toEqual([{ kind: SegmentKind.Narration, text: 'A real-time map.' }]);
  });

  it('looking at a locked exit returns mechanical locked template', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc, locB],
      exits: [lockedExit],
      items: [],
      agents: [paff],
    });
    const r = await handleLook(
      { kind: 'look', actorId: paff.id, target: { kind: ExaminableKind.Exit, id: lockedExit.id } },
      repo,
      { ai: nullGameAI },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toEqual([{
      kind: SegmentKind.Narration,
      text: 'The iron gate leads south. It is locked.',
    }]);
  });

  it('looking at an exit with null destination returns unobstructed template', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [nullDestExit],
      items: [],
      agents: [paff],
    });
    const r = await handleLook(
      { kind: 'look', actorId: paff.id, target: { kind: ExaminableKind.Exit, id: nullDestExit.id } },
      repo,
      { ai: nullGameAI },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toEqual([{
      kind: SegmentKind.Narration,
      text: 'The dark passage leads east. It is unobstructed.',
    }]);
  });

  it('unlocked exit with nullGameAI falls back to template with destination name', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc, locB],
      exits: [unlockedExit],
      items: [],
      agents: [paff],
    });
    const r = await handleLook(
      { kind: 'look', actorId: paff.id, target: { kind: ExaminableKind.Exit, id: unlockedExit.id } },
      repo,
      { ai: nullGameAI },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toEqual([{
      kind: SegmentKind.Narration,
      text: 'The oak door leads north to Merchant Quarter.',
    }]);
  });

  it('unlocked exit with AI uses generated prose', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc, locB],
      exits: [unlockedExit],
      items: [],
      agents: [paff],
    });
    const spyAI = {
      ...nullGameAI,
      peekExit: vi.fn().mockResolvedValue('You see a bustling market beyond the door.'),
    };
    const r = await handleLook(
      { kind: 'look', actorId: paff.id, target: { kind: ExaminableKind.Exit, id: unlockedExit.id } },
      repo,
      { ai: spyAI },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toEqual([{
      kind: SegmentKind.Narration,
      text: 'You see a bustling market beyond the door.',
    }]);
    expect(spyAI.peekExit).toHaveBeenCalledWith(unlockedExit, locB, null);
  });
});
