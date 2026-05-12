import {
  cloneLiveAsDraft as cloneLiveAsDraftCore,
  createDraft as createDraftCore,
  getWorldTree,
  listWorlds as listWorldsCore,
  updateWorldCover as updateWorldCoverCore,
} from '@core/builder/index';
import { asAgentId, asWorldId } from '@core/domain/ids';
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

/**
 * Bulk-silence every agent in the world: clears `autonomous` and `awake`.
 * Writes go through the BuilderRepository port directly so this works on
 * live worlds as well as drafts (the spawn and consequence engines use the
 * same runtime-bypass pattern). Intended as a debug override during dev.
 */
/**
 * Admin debug override: flip the `autonomous` bit on a single agent.
 * Bypasses requireDraft so it works on live worlds.
 */
export const setAgentAutonomous = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { worldId?: unknown }).worldId !== 'string' ||
      typeof (d as { agentId?: unknown }).agentId !== 'string' ||
      typeof (d as { autonomous?: unknown }).autonomous !== 'boolean'
    ) {
      throw new Error('Expected { worldId: string, agentId: string, autonomous: boolean }');
    }
    return d as { worldId: string; agentId: string; autonomous: boolean };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    await repo.setAgentAutonomous(asWorldId(data.worldId), asAgentId(data.agentId), data.autonomous);
    return { ok: true as const };
  });

export const silenceAllAgents = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
      throw new Error('Expected { id: string }');
    }
    return d as { id: string };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    const result = await repo.silenceAllAgents(asWorldId(data.id));
    return { ok: true as const, value: result };
  });

export const updateWorldCover = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
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
