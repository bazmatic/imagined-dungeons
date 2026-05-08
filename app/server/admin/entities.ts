import {
  deleteAgent as deleteAgentCore,
  deleteExit as deleteExitCore,
  deleteItem as deleteItemCore,
  deleteLocation as deleteLocationCore,
  upsertAgent as upsertAgentCore,
  upsertExit as upsertExitCore,
  upsertItem as upsertItemCore,
  upsertLocation as upsertLocationCore,
} from '@core/builder/index';
import { EntityKind } from '@core/domain/builder-kinds';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { OwnerKind } from '@core/domain/kinds';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

interface SaveInput {
  worldId: string;
  entity: (typeof EntityKind)[keyof typeof EntityKind];
  payload: unknown;
}

export const saveEntity = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { worldId?: unknown }).worldId !== 'string' ||
      typeof (d as { entity?: unknown }).entity !== 'string'
    ) {
      throw new Error('Expected { worldId, entity, payload }');
    }
    return d as SaveInput;
  })
  .handler(async ({ data }) => {
    const repo = getBuilderRepo();
    const W = asWorldId(data.worldId);
    const p = data.payload as Record<string, unknown>;
    if (data.entity === EntityKind.Location) {
      return upsertLocationCore(repo, W, {
        id: asLocationId(p.id as string),
        label: p.label as string,
        shortDescription: p.shortDescription as string,
        longDescription: p.longDescription as string,
      });
    }
    if (data.entity === EntityKind.Exit) {
      return upsertExitCore(repo, W, {
        id: asExitId(p.id as string),
        from: asLocationId(p.from as string),
        to: asLocationId(p.to as string),
        direction: p.direction as string,
        label: p.label as string,
        locked: Boolean(p.locked),
        lockedByItem:
          typeof p.lockedByItem === 'string' && p.lockedByItem.length > 0
            ? asItemId(p.lockedByItem)
            : null,
      });
    }
    if (data.entity === EntityKind.Item) {
      return upsertItemCore(repo, W, {
        id: asItemId(p.id as string),
        label: p.label as string,
        shortDescription: p.shortDescription as string,
        longDescription: p.longDescription as string,
        ownerKind: p.ownerKind as OwnerKind,
        ownerId: p.ownerId as string,
        weight: p.weight as number,
        hidden: Boolean(p.hidden),
      });
    }
    return upsertAgentCore(repo, W, {
      id: asAgentId(p.id as string),
      label: p.label as string,
      shortDescription: p.shortDescription as string,
      longDescription: p.longDescription as string,
      locationId: asLocationId(p.locationId as string),
      hp: p.hp as number,
      damage: p.damage as number,
      defense: p.defense as number,
      capacity: p.capacity as number,
      mood: (p.mood as string | null) ?? null,
      goal: (p.goal as string | null) ?? null,
      autonomous: Boolean(p.autonomous),
    });
  });

interface DeleteInput {
  worldId: string;
  entity: (typeof EntityKind)[keyof typeof EntityKind];
  id: string;
}

export const deleteEntity = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { worldId?: unknown }).worldId !== 'string' ||
      typeof (d as { entity?: unknown }).entity !== 'string' ||
      typeof (d as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Expected { worldId, entity, id }');
    }
    return d as DeleteInput;
  })
  .handler(async ({ data }) => {
    const repo = getBuilderRepo();
    const W = asWorldId(data.worldId);
    if (data.entity === EntityKind.Location)
      return deleteLocationCore(repo, W, asLocationId(data.id));
    if (data.entity === EntityKind.Exit) return deleteExitCore(repo, W, asExitId(data.id));
    if (data.entity === EntityKind.Item) return deleteItemCore(repo, W, asItemId(data.id));
    return deleteAgentCore(repo, W, asAgentId(data.id));
  });
