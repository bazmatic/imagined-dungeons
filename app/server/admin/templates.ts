import {
  deleteMonsterTemplate as deleteTemplateCore,
  deleteLocationSpawnTrigger as deleteTriggerCore,
  upsertMonsterTemplate as upsertTemplateCore,
  upsertLocationSpawnTrigger as upsertTriggerCore,
} from '@core/builder/index';
import type {
  UpsertLocationSpawnTriggerInput,
  UpsertMonsterTemplateInput,
} from '@core/domain/builder-types';
import { asLocationId, asMonsterTemplateId, asSpawnTriggerId, asWorldId } from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

export const upsertTemplate = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null) throw new Error('Expected { worldId, payload }');
    return d as { worldId: string; payload: UpsertMonsterTemplateInput };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    return upsertTemplateCore(repo, asWorldId(data.worldId), {
      ...data.payload,
      id: asMonsterTemplateId(data.payload.id as unknown as string),
    });
  });

export const deleteTemplate = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null) throw new Error('Expected { worldId, id }');
    return d as { worldId: string; id: string };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    return deleteTemplateCore(repo, asWorldId(data.worldId), asMonsterTemplateId(data.id));
  });

export const upsertTrigger = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null) throw new Error('Expected { worldId, payload }');
    return d as { worldId: string; payload: UpsertLocationSpawnTriggerInput };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    return upsertTriggerCore(repo, asWorldId(data.worldId), {
      ...data.payload,
      id: asSpawnTriggerId(data.payload.id as unknown as string),
      locationId: asLocationId(data.payload.locationId as unknown as string),
      templateId: asMonsterTemplateId(data.payload.templateId as unknown as string),
    });
  });

export const deleteTrigger = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null) throw new Error('Expected { worldId, id }');
    return d as { worldId: string; id: string };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    return deleteTriggerCore(repo, asWorldId(data.worldId), asSpawnTriggerId(data.id));
  });
