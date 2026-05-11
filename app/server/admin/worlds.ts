import {
  cloneLiveAsDraft as cloneLiveAsDraftCore,
  createDraft as createDraftCore,
  getWorldTree,
  listWorlds as listWorldsCore,
  updateWorldCover as updateWorldCoverCore,
} from '@core/builder/index';
import { asWorldId } from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

export const listWorlds = createServerFn({ method: 'GET' }).handler(async () => {
  return listWorldsCore(await getBuilderRepo());
});

export const createDraft = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { displayName?: unknown }).displayName !== 'string' ||
      typeof (d as { label?: unknown }).label !== 'string'
    ) {
      throw new Error('Expected { displayName: string, label: string }');
    }
    return d as { displayName: string; label: string };
  })
  .handler(async ({ data }) => createDraftCore(await getBuilderRepo(), data));

export const cloneLive = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
      throw new Error('Expected { id: string }');
    }
    return d as { id: string };
  })
  .handler(async ({ data }) => cloneLiveAsDraftCore(await getBuilderRepo(), asWorldId(data.id)));

export const getWorld = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
      throw new Error('Expected { id: string }');
    }
    return d as { id: string };
  })
  .handler(async ({ data }) => getWorldTree(await getBuilderRepo(), asWorldId(data.id)));

export const updateWorldCover = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Expected { id: string, coverImageUrl: string | null }');
    }
    const cover = (d as { coverImageUrl?: unknown }).coverImageUrl;
    if (cover !== null && typeof cover !== 'string') {
      throw new Error('coverImageUrl must be string or null');
    }
    return d as { id: string; coverImageUrl: string | null };
  })
  .handler(async ({ data }) =>
    updateWorldCoverCore(await getBuilderRepo(), asWorldId(data.id), data.coverImageUrl),
  );
