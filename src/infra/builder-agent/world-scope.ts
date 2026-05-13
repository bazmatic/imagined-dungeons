import { AgentExcludedTool } from '../../mcp/agent-excluded-tools';

export const WorldIdFieldTool = {
  GetWorld: 'get_world',
  ValidateWorld: 'validate_world',
  GetWorldLore: 'get_world_lore',
  UpdateWorldLore: 'update_world_lore',
} as const;
export type WorldIdFieldTool = (typeof WorldIdFieldTool)[keyof typeof WorldIdFieldTool];

const WORLD_ID_IN_ID: ReadonlySet<string> = new Set<string>(Object.values(WorldIdFieldTool));

export type ScopeOk = { readonly ok: true };
export type ScopeErr = { readonly ok: false; readonly error: string };
export type ScopeResult = ScopeOk | ScopeErr;

export function validatePinnedDraftToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  pinnedWorldId: string,
): ScopeResult {
  if (toolName === AgentExcludedTool.ListWorlds || toolName === AgentExcludedTool.CreateWorld) {
    return { ok: false, error: `tool not allowed in admin agent: ${toolName}` };
  }
  if (WORLD_ID_IN_ID.has(toolName)) {
    const id = args.id;
    if (typeof id !== 'string' || id !== pinnedWorldId) {
      return { ok: false, error: `tool ${toolName} requires id to equal the open draft` };
    }
    return { ok: true };
  }
  const worldId = args.worldId;
  if (typeof worldId === 'string') {
    if (worldId !== pinnedWorldId) {
      return { ok: false, error: 'worldId does not match the open draft' };
    }
    return { ok: true };
  }
  return { ok: false, error: `tool ${toolName} missing worldId (or unsupported shape)` };
}
