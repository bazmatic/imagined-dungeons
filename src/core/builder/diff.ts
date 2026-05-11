import { EntityKind, SkipReasonKind } from '@core/domain/builder-kinds';
import type { EntityRef, MergePlan, SkipReport, WorldTree } from '@core/domain/builder-types';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';

/**
 * Three-way structural merge. Inputs are the last-published snapshot, the
 * current draft, and the current live world. Output is a plan of
 * inserts/updates/deletes plus a skip list for rows where applying the
 * authored change would clobber gameplay drift.
 *
 * Runtime-only fields on agents (`hp`, `mood`, `shortTermIntent`, `awake`)
 * are excluded from the comparison: they belong to gameplay, not authoring.
 */
export function computeMergePlan(
  snapshot: WorldTree,
  draft: WorldTree,
  live: WorldTree,
): MergePlan {
  const skipped: SkipReport[] = [];
  const inserts = blank();
  const updates = blank();
  const deletes: EntityRef[] = [];

  diffEntity(EntityKind.Location, snapshot.locations, draft.locations, live.locations, locEq, {
    inserts,
    updates,
    deletes,
    skipped,
  });
  diffEntity(EntityKind.Exit, snapshot.exits, draft.exits, live.exits, exitEq, {
    inserts,
    updates,
    deletes,
    skipped,
  });
  diffEntity(EntityKind.Item, snapshot.items, draft.items, live.items, itemEq, {
    inserts,
    updates,
    deletes,
    skipped,
  });
  diffEntity(EntityKind.Agent, snapshot.agents, draft.agents, live.agents, agentStructEq, {
    inserts,
    updates,
    deletes,
    skipped,
  });

  return { inserts, updates, deletes, skipped };
}

interface Acc {
  inserts: ReturnType<typeof blank>;
  updates: ReturnType<typeof blank>;
  deletes: EntityRef[];
  skipped: SkipReport[];
}

function blank() {
  return {
    locations: [] as Location[],
    exits: [] as Exit[],
    items: [] as Item[],
    agents: [] as Agent[],
  };
}

function diffEntity<T extends { id: unknown }>(
  kind: EntityKind,
  snap: readonly T[],
  draft: readonly T[],
  live: readonly T[],
  eq: (a: T, b: T) => boolean,
  acc: Acc,
): void {
  const snapMap = new Map(snap.map((r) => [r.id as string, r]));
  const draftMap = new Map(draft.map((r) => [r.id as string, r]));
  const liveMap = new Map(live.map((r) => [r.id as string, r]));

  // Inserts and updates.
  for (const [id, dRow] of draftMap) {
    const sRow = snapMap.get(id);
    const lRow = liveMap.get(id);
    if (!sRow && !lRow) {
      pushTo(acc.inserts, kind, dRow);
      continue;
    }
    if (sRow && !lRow) {
      // Was in the last publish, gone from live. Treat as re-insert; report skip.
      pushTo(acc.inserts, kind, dRow);
      acc.skipped.push({
        ref: refOf(kind, id),
        reason: SkipReasonKind.LiveDeletedRow,
      });
      continue;
    }
    if (!sRow && lRow) {
      // Created in both branches with the same id. Treat divergence cautiously.
      if (eq(dRow, lRow)) continue;
      acc.skipped.push({
        ref: refOf(kind, id),
        reason: SkipReasonKind.LiveDivergedFromSnapshot,
      });
      continue;
    }
    // Both sides present; have a snapshot to compare against.
    if (sRow && lRow) {
      const draftEqualsSnap = eq(dRow, sRow);
      const liveEqualsSnap = eq(lRow, sRow);
      if (draftEqualsSnap) continue; // author changed nothing
      if (liveEqualsSnap) {
        pushTo(acc.updates, kind, dRow);
      } else {
        acc.skipped.push({
          ref: refOf(kind, id),
          reason: SkipReasonKind.LiveDivergedFromSnapshot,
        });
      }
    }
  }

  // Deletes.
  for (const [id, sRow] of snapMap) {
    if (draftMap.has(id)) continue;
    const lRow = liveMap.get(id);
    if (!lRow) continue; // already gone from live
    if (eq(lRow, sRow)) {
      acc.deletes.push(refOf(kind, id));
    } else {
      acc.skipped.push({
        ref: refOf(kind, id),
        reason: SkipReasonKind.LiveDivergedFromSnapshot,
      });
    }
  }
}

function pushTo(bucket: ReturnType<typeof blank>, kind: EntityKind, row: unknown): void {
  if (kind === EntityKind.Location) bucket.locations.push(row as Location);
  else if (kind === EntityKind.Exit) bucket.exits.push(row as Exit);
  else if (kind === EntityKind.Item) bucket.items.push(row as Item);
  else bucket.agents.push(row as Agent);
}

function refOf(kind: EntityKind, id: string): EntityRef {
  if (kind === EntityKind.Location) return { kind, id: id as never };
  if (kind === EntityKind.Exit) return { kind, id: id as never };
  if (kind === EntityKind.Item) return { kind, id: id as never };
  return { kind, id: id as never };
}

function arrayEq(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const locEq = (a: Location, b: Location) =>
  a.label === b.label &&
  a.shortDescription === b.shortDescription &&
  a.longDescription === b.longDescription &&
  arrayEq(a.tags, b.tags);

const exitEq = (a: Exit, b: Exit) =>
  a.from === b.from &&
  a.to === b.to &&
  a.direction === b.direction &&
  a.label === b.label &&
  a.locked === b.locked &&
  a.lockedByItem === b.lockedByItem;

const itemEq = (a: Item, b: Item) =>
  a.label === b.label &&
  a.shortDescription === b.shortDescription &&
  a.longDescription === b.longDescription &&
  a.owner.kind === b.owner.kind &&
  a.owner.id === b.owner.id &&
  a.weight === b.weight &&
  a.hidden === b.hidden;

// Structural-only agent equality: ignores hp, mood, shortTermIntent, awake.
const agentStructEq = (a: Agent, b: Agent) =>
  a.label === b.label &&
  a.shortDescription === b.shortDescription &&
  a.longDescription === b.longDescription &&
  a.locationId === b.locationId &&
  a.damage === b.damage &&
  a.defense === b.defense &&
  a.capacity === b.capacity &&
  a.goal === b.goal &&
  a.autonomous === b.autonomous;
