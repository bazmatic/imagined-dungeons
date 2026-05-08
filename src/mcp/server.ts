import 'dotenv/config';
import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { openDb } from '@infra/db';
import { seedIfEmpty } from '@infra/seed/seeder';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, TOOL_BY_NAME } from './tools';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';

async function main() {
  const handle = openDb(DB_PATH);
  await seedIfEmpty(handle.db, BURNING_DISTRICT_CAMPAIGN);
  const repo = new SqliteBuilderRepository(handle.db);

  const server = new Server(
    { name: 'imagined-dungeons-builder', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOL_BY_NAME[req.params.name];
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }],
      };
    }
    try {
      const result = await tool.run(repo, (req.params.arguments ?? {}) as Record<string, unknown>);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        isError: true,
        content: [{ type: 'text', text: `tool ${req.params.name} threw: ${message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
