// src/core/builder/diff.test.ts
import { SkipReasonKind } from '@core/domain/builder-kinds';
import { WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { computeMergePlan } from './diff';

const W = asWorldId('w_live');
const D = asWorldId('w_draft');

const emptyTree = (id = W, kind: WorldKind = WorldKind.Live): WorldTree => ({
  summary: {
    id,
    kind,
    label: 'L',
    displayName: 'D',
    parentDraftId: null,
    playerAgentId: null,
    coverImageUrl: null,
  },
  locations: [],
  exits: [],
  items: [],
  agents: [],
  templates: [],
  triggers: [],
  worldLore: { worldId: id, worldOverview: '', storySoFar: '' },
  tagLore: [],
});

const loc = (id: string, label: string) => ({
  id: asLocationId(id),
  worldId: W,
  label,
  shortDescription: '',
  longDescription: '',
  tags: [] as readonly string[],
});

describe('computeMergePlan', () => {
  it('inserts rows present only in the draft', () => {
    const draft = { ...emptyTree(D, WorldKind.Draft), locations: [loc('loc_a', 'A')] };
    const plan = computeMergePlan(emptyTree(), draft, emptyTree());
    expect(plan.inserts.locations.map((l) => l.id as string)).toEqual(['loc_a']);
    expect(plan.skipped).toEqual([]);
  });

  it('updates a row when the draft differs from snapshot but live equals snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const draft = {
      ...emptyTree(D, WorldKind.Draft),
      locations: [loc('loc_a', 'A renamed')],
    };
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.updates.locations.map((l) => l.label)).toEqual(['A renamed']);
    expect(plan.skipped).toEqual([]);
  });

  it('skips updates when live diverged from snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A from gameplay')] };
    const draft = {
      ...emptyTree(D, WorldKind.Draft),
      locations: [loc('loc_a', 'A from author')],
    };
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.updates.locations).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    const first = plan.skipped[0];
    if (!first) throw new Error('expected one skip');
    expect(first.reason).toBe(SkipReasonKind.LiveDivergedFromSnapshot);
  });

  it('deletes a row dropped from the draft when live still equals snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const draft = emptyTree(D, WorldKind.Draft);
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.deletes.map((r) => r.id as string)).toEqual(['loc_a']);
  });

  it('skips deletes when live diverged from snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A drifted')] };
    const draft = emptyTree(D, WorldKind.Draft);
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.deletes).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    const first = plan.skipped[0];
    if (!first) throw new Error('expected one skip');
    expect(first.reason).toBe(SkipReasonKind.LiveDivergedFromSnapshot);
  });

  it('ignores runtime-only fields on agents', () => {
    const baseAgent = {
      id: asAgentId('char_x'),
      worldId: W,
      label: 'X',
      shortDescription: '',
      longDescription: '',
      locationId: asLocationId('loc_a'),
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: null,
      shortTermIntent: null,
      goal: null,
      autonomous: false,
      awake: false,
      tags: [],
    };
    const snap = { ...emptyTree(), agents: [{ ...baseAgent }] };
    // Live diverges only on runtime fields (hp, mood, shortTermIntent, awake).
    const live = {
      ...emptyTree(),
      agents: [{ ...baseAgent, hp: 3, mood: 'wounded', shortTermIntent: 'flee', awake: true }],
    };
    const draft = {
      ...emptyTree(D, WorldKind.Draft),
      agents: [{ ...baseAgent, label: 'X renamed' }],
    };
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.updates.agents).toHaveLength(1);
    const firstAgent = plan.updates.agents[0];
    if (!firstAgent) throw new Error('expected one updated agent');
    expect(firstAgent.label).toBe('X renamed');
    expect(plan.skipped).toEqual([]);
  });

  it('reports no-op when draft equals snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A drifted')] };
    const draft = { ...emptyTree(D, WorldKind.Draft), locations: [loc('loc_a', 'A')] };
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.updates.locations).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });
});
