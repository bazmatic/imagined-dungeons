import { publish as publishCore, resetLiveToDraft as resetCore } from '@core/builder/index';
import { asWorldId } from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

const idInput = (d: unknown) => {
  if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
    throw new Error('Expected { id: string }');
  }
  return d as { id: string };
};

export const publish = createServerFn({ method: 'POST' })
  .inputValidator(idInput)
  .handler(async ({ data }) => publishCore(await getBuilderRepo(), asWorldId(data.id)));

export const resetLive = createServerFn({ method: 'POST' })
  .inputValidator(idInput)
  .handler(async ({ data }) => resetCore(await getBuilderRepo(), asWorldId(data.id)));
