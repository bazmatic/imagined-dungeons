import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { describe, expect, it } from 'vitest';
import { TOOL_BY_NAME } from './tools';

describe('MCP tool surface', () => {
  it('list_worlds returns []', async () => {
    const repo = new MemoryBuilderRepository();
    const tool = TOOL_BY_NAME.list_worlds;
    if (!tool) throw new Error('tool missing');
    const r = await tool.run(repo, {});
    expect(r).toEqual([]);
  });

  it('create_draft + get_world round-trips through tools', async () => {
    const repo = new MemoryBuilderRepository();
    const create = TOOL_BY_NAME.create_draft;
    const get = TOOL_BY_NAME.get_world;
    if (!create || !get) throw new Error('tool missing');
    const created = (await create.run(repo, {
      displayName: 'X',
      label: 'L',
    })) as { ok: boolean; value?: string };
    expect(created.ok).toBe(true);
    const got = await get.run(repo, { worldId: created.value });
    expect((got as { ok: boolean }).ok).toBe(true);
  });

  it('every TOOL_BY_NAME entry has a description and a runnable handler', () => {
    for (const t of Object.values(TOOL_BY_NAME)) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.run).toBe('function');
    }
  });

  it('does not expose reset_live_to_draft', () => {
    expect(TOOL_BY_NAME.reset_live_to_draft).toBeUndefined();
  });
});
