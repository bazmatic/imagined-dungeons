import type { Config } from 'drizzle-kit';

export default {
  schema: './src/infra/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: './imagined-dungeons.db' },
} satisfies Config;
