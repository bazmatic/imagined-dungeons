import 'dotenv/config';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { type DbHandle, openDb } from '@infra/db';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';
let handle: DbHandle | null = null;

export function getBuilderRepo(): SqliteBuilderRepository {
  if (!handle) handle = openDb(DB_PATH);
  return new SqliteBuilderRepository(handle.db);
}
