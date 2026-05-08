import { getWorldTree } from '@core/builder/index';
import { validateWorld as validateCore } from '@core/builder/validate';
import { asWorldId } from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

export const validate = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
      throw new Error('Expected { id: string }');
    }
    return d as { id: string };
  })
  .handler(async ({ data }) => {
    const tree = await getWorldTree(await getBuilderRepo(), asWorldId(data.id));
    if (!tree.ok) return { ok: false as const, error: tree.error };
    return { ok: true as const, value: validateCore(tree.value) };
  });
