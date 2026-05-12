import { saveStartingState } from '@core/builder/index';
/**
 * One-off backfill: ensure every scratch (Draft) world has a starting-state
 * snapshot populated from its current entity tables. Required after the
 * Load/Save/Reset refactor so existing dev DBs (where the Burning District
 * scratch was a hand-edited draft) can Load and Reset without errors.
 *
 * Idempotent: re-saves every scratch's snapshot from its current state.
 * Usage:
 *   pnpm exec tsx scripts/backfill-starting-states.ts
 */
import { WorldKind } from '@core/domain/builder-kinds';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { openDb } from '@infra/db';

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? './imagined-dungeons.db';
  const handle = openDb(dbPath);
  const repo = new SqliteBuilderRepository(handle.db);
  const worlds = await repo.listWorlds();
  let ok = 0;
  let skipped = 0;
  for (const w of worlds) {
    if (w.kind !== WorldKind.Draft) {
      skipped += 1;
      continue;
    }
    const r = await saveStartingState(repo, w.id);
    if (!r.ok) {
      console.error(`Failed to save ${w.id as string}: ${r.error.message}`);
      continue;
    }
    ok += 1;
    console.log(`Saved starting state for ${w.id as string}`);
  }
  console.log(`Done. saved=${ok} skipped=${skipped} total=${worlds.length}`);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
