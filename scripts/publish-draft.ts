/**
 * Publish a draft world via MCP. Usage:
 *   pnpm exec tsx scripts/publish-draft.ts <draftId>
 *
 * Exercises the production MCP surface (publish_world tool). Reports the
 * skipped-changes summary and any validation errors.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const draftId = process.argv[2] ?? 'w_draft_hyrqunaa';

interface JsonText {
  readonly type: 'text';
  readonly text: string;
}
interface CallToolResult {
  readonly content: readonly JsonText[];
  readonly isError?: boolean;
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: 'pnpm',
    args: ['mcp'],
    env: { ...process.env, ...(process.env.DB_PATH ? { DB_PATH: process.env.DB_PATH } : {}) },
  });
  const client = new Client({ name: 'publish-script', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    console.log(`→ publish_world ${draftId}`);
    const r = (await client.callTool({
      name: 'publish_world',
      arguments: { id: draftId },
    })) as CallToolResult;
    const first = r.content[0];
    if (!first) throw new Error('empty response');
    if (r.isError === true) {
      console.error(`MCP error: ${first.text}`);
      process.exit(1);
    }
    const parsed = JSON.parse(first.text) as
      | { ok: true; value: { liveWorldId: string; skipped: readonly unknown[] } }
      | { ok: false; error: { kind: string; message: string; problems?: readonly unknown[] } };
    if (!parsed.ok) {
      console.error(`Publish failed: ${parsed.error.kind} — ${parsed.error.message}`);
      if (parsed.error.problems) {
        console.error('Problems:');
        for (const p of parsed.error.problems) console.error('  ', p);
      }
      process.exit(1);
    }
    console.log(`Published. Live world: ${parsed.value.liveWorldId}`);
    console.log(`Skipped changes: ${parsed.value.skipped.length}`);
    for (const s of parsed.value.skipped) console.log('  ', s);
  } finally {
    await client.close();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
