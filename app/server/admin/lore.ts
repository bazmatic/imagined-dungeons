import {
  deleteTagLore as deleteTagLoreCore,
  getWorldLore as getWorldLoreCore,
  updateWorldLore as updateWorldLoreCore,
  upsertTagLore as upsertTagLoreCore,
} from '@core/builder/index';
import { asTagLoreId, asWorldId } from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

export const getWorldLore = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
      throw new Error('Expected { id: string }');
    }
    return d as { id: string };
  })
  .handler(async ({ data }) => getWorldLoreCore(await getBuilderRepo(), asWorldId(data.id)));

export const updateWorldLore = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { id?: unknown }).id !== 'string' ||
      typeof (d as { worldOverview?: unknown }).worldOverview !== 'string' ||
      typeof (d as { storySoFar?: unknown }).storySoFar !== 'string'
    ) {
      throw new Error('Expected { id: string, worldOverview: string, storySoFar: string }');
    }
    return d as { id: string; worldOverview: string; storySoFar: string };
  })
  .handler(async ({ data }) =>
    updateWorldLoreCore(await getBuilderRepo(), asWorldId(data.id), {
      worldOverview: data.worldOverview,
      storySoFar: data.storySoFar,
    }),
  );

export const listTagLore = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { worldId?: unknown }).worldId !== 'string'
    ) {
      throw new Error('Expected { worldId: string }');
    }
    return d as { worldId: string };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    return repo.listTagLore(asWorldId(data.worldId));
  });

interface UpsertTagLorePayload {
  readonly id: string;
  readonly tag: string;
  readonly title: string;
  readonly description: string;
}

export const upsertTagLore = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { worldId?: unknown }).worldId !== 'string'
    ) {
      throw new Error('Expected { worldId: string, payload: {...} }');
    }
    const p = (d as { payload?: unknown }).payload;
    if (
      typeof p !== 'object' ||
      p === null ||
      typeof (p as { id?: unknown }).id !== 'string' ||
      typeof (p as { tag?: unknown }).tag !== 'string' ||
      typeof (p as { title?: unknown }).title !== 'string' ||
      typeof (p as { description?: unknown }).description !== 'string'
    ) {
      throw new Error('payload must be { id, tag, title, description } strings');
    }
    return d as { worldId: string; payload: UpsertTagLorePayload };
  })
  .handler(async ({ data }) =>
    upsertTagLoreCore(await getBuilderRepo(), asWorldId(data.worldId), {
      id: asTagLoreId(data.payload.id),
      tag: data.payload.tag,
      title: data.payload.title,
      description: data.payload.description,
    }),
  );

export const deleteTagLore = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { worldId?: unknown }).worldId !== 'string' ||
      typeof (d as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Expected { worldId: string, id: string }');
    }
    return d as { worldId: string; id: string };
  })
  .handler(async ({ data }) =>
    deleteTagLoreCore(await getBuilderRepo(), asWorldId(data.worldId), asTagLoreId(data.id)),
  );
