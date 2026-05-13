import { describe, expect, it } from 'vitest';
import { AgentExcludedTool } from '../../mcp/agent-excluded-tools';
import { validatePinnedDraftToolArgs } from './world-scope';

const PINNED = 'world-draft-1';

describe('validatePinnedDraftToolArgs', () => {
  it('accepts get_world when id matches', () => {
    expect(validatePinnedDraftToolArgs('get_world', { id: PINNED }, PINNED)).toEqual({ ok: true });
  });
  it('rejects get_world when id differs', () => {
    const r = validatePinnedDraftToolArgs('get_world', { id: 'other' }, PINNED);
    expect(r.ok).toBe(false);
  });
  it('accepts upsert_location when worldId matches', () => {
    expect(
      validatePinnedDraftToolArgs('upsert_location', { worldId: PINNED, id: 'loc1' }, PINNED),
    ).toEqual({ ok: true });
  });
  it('rejects upsert_location when worldId differs', () => {
    const r = validatePinnedDraftToolArgs(
      'upsert_location',
      { worldId: 'other', id: 'loc1' },
      PINNED,
    );
    expect(r.ok).toBe(false);
  });
  it('rejects excluded MCP tools by name', () => {
    expect(validatePinnedDraftToolArgs(AgentExcludedTool.CreateWorld, {}, PINNED).ok).toBe(false);
  });
});
