import 'dotenv/config';
import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { openDb } from '@infra/db';
import * as schema from '@infra/schema';
import { eq } from 'drizzle-orm';

/**
 * One-shot: backfill displayName and playerAgentId on rows that pre-date
 * the campaign-builder migration. Idempotent.
 */
async function main() {
  const path = process.env.DB_PATH ?? './imagined-dungeons.db';
  const handle = openDb(path);
  const rows = await handle.db.select().from(schema.worlds);
  for (const row of rows) {
    const patch: Partial<typeof schema.worlds.$inferInsert> = {};
    if (!row.displayName) patch.displayName = row.label;
    if (!row.playerAgentId && row.id === BURNING_DISTRICT_CAMPAIGN.worldId) {
      patch.playerAgentId = BURNING_DISTRICT_CAMPAIGN.playerId;
    }
    if (Object.keys(patch).length > 0) {
      await handle.db.update(schema.worlds).set(patch).where(eq(schema.worlds.id, row.id));
    }
  }
  handle.close();
  console.log(`Migrated ${rows.length} world row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
