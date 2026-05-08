/**
 * Wipe the campaign DB so the next dev-server start re-seeds from scratch.
 *
 * Usage: `pnpm reset` (or `pnpm exec tsx scripts/reset-db.ts`).
 *
 * Honours $DB_PATH (same env var as app/server/world.ts), defaulting to
 * ./imagined-dungeons.db. SQLite WAL mode produces -shm and -wal sidecar
 * files; this removes all three so there's nothing left to recover from.
 *
 * Refuses to run if the DB file is currently held open by another process
 * (typically `pnpm dev`) — kill that first to avoid leaving the running
 * server with stale handles.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const DB_PATH = resolve(process.env.DB_PATH ?? './imagined-dungeons.db');
const SIDECARS = [`${DB_PATH}-shm`, `${DB_PATH}-wal`];
const FILES = [DB_PATH, ...SIDECARS];

function isHeldOpen(path: string): boolean {
  if (!existsSync(path)) return false;
  // `lsof <path>` exits 0 when at least one process holds the file open,
  // 1 when no process does. Anything else (including missing lsof) is
  // treated as "can't tell" — we proceed.
  try {
    execFileSync('lsof', [path], { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch (err) {
    const exit = (err as { status?: number }).status;
    if (exit === 1) return false;
    return false;
  }
}

const heldOpen = FILES.filter(isHeldOpen);
if (heldOpen.length > 0) {
  console.error(
    `Refusing to reset: the following file(s) are currently open by another process:\n  ${heldOpen.join('\n  ')}\n\nStop \`pnpm dev\` (or whatever else has them open) and try again.`,
  );
  process.exit(1);
}

let removed = 0;
for (const f of FILES) {
  if (existsSync(f)) {
    unlinkSync(f);
    console.log(`removed ${f}`);
    removed++;
  }
}
if (removed === 0) {
  console.log(`No DB files found at ${DB_PATH} — nothing to do.`);
} else {
  console.log('Reset complete. Next `pnpm dev` will re-seed from the campaign.');
}
