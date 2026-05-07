/**
 * Manual smoke test: prove that take + close + reopen preserves inventory on disk.
 * Run: `pnpm exec tsx scripts/smoke-resume.ts`
 */
import { unlinkSync } from 'node:fs';
import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { runTurn } from '@core/engine/turn';
import { openDb } from '@infra/db';
import { seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';

const PAFF = BURNING_DISTRICT_CAMPAIGN.playerId;
const WORLD_ID = BURNING_DISTRICT_CAMPAIGN.worldId;
const DB = './smoke-resume.db';

try {
  unlinkSync(DB);
} catch {}
try {
  unlinkSync(`${DB}-journal`);
} catch {}
try {
  unlinkSync(`${DB}-wal`);
} catch {}
try {
  unlinkSync(`${DB}-shm`);
} catch {}

// Round 1
{
  const h = openDb(DB);
  await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
  const repo = new SqliteRepository(h.db, WORLD_ID);
  const r = await runTurn(PAFF, 'take fire map', repo);
  console.log('Round 1:', r.render);
  h.close();
}

// Round 2 — reopen
{
  const h = openDb(DB);
  const repo = new SqliteRepository(h.db, WORLD_ID);
  const r = await runTurn(PAFF, 'i', repo);
  console.log('Round 2:', r.render);
  if (!r.render.toLowerCase().includes('fire map')) {
    console.error('FAIL: fire map not in inventory after reopen');
    process.exit(1);
  }
  console.log('OK: state persisted across reopen');
  h.close();
}

try {
  unlinkSync(DB);
} catch {}
try {
  unlinkSync(`${DB}-journal`);
} catch {}
try {
  unlinkSync(`${DB}-wal`);
} catch {}
try {
  unlinkSync(`${DB}-shm`);
} catch {}
