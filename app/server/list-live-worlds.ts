import { eq } from 'drizzle-orm';
import { createServerFn } from '@tanstack/react-start';
import { WorldKind } from '@core/domain/builder-kinds';
import * as schema from '@infra/schema';
import { getDb } from './world';

export const listLiveWorlds = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDb();
  return db
    .select({
      id: schema.worlds.id,
      displayName: schema.worlds.displayName,
    })
    .from(schema.worlds)
    .where(eq(schema.worlds.kind, WorldKind.Live));
});
