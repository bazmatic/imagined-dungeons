export const AgentExcludedTool = {
  ListWorlds: 'list_worlds',
  CreateWorld: 'create_world',
} as const;

export type AgentExcludedTool = (typeof AgentExcludedTool)[keyof typeof AgentExcludedTool];

export const AGENT_EXCLUDED_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  Object.values(AgentExcludedTool),
);
