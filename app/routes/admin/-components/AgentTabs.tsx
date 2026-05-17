import { useState } from 'react';
import { AgentForm, type AgentFormProps } from './AgentForm';
import { SensoriumTab } from './SensoriumTab';

export const AgentTabKind = {
  Profile: 'profile',
  Sensorium: 'sensorium',
} as const;
export type AgentTabKind = (typeof AgentTabKind)[keyof typeof AgentTabKind];

type AgentTabsProps = AgentFormProps;

export function AgentTabs({ tree, agentId, onSaved, onDeleted }: AgentTabsProps) {
  const [tab, setTab] = useState<AgentTabKind>(AgentTabKind.Profile);
  const worldId = tree.summary.id as string;

  return (
    <div className="agent-tabs">
      <div className="agent-tabs__bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === AgentTabKind.Profile}
          className={`agent-tabs__tab${tab === AgentTabKind.Profile ? ' agent-tabs__tab--active' : ''}`}
          onClick={() => setTab(AgentTabKind.Profile)}
        >
          Profile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === AgentTabKind.Sensorium}
          className={`agent-tabs__tab${tab === AgentTabKind.Sensorium ? ' agent-tabs__tab--active' : ''}`}
          onClick={() => setTab(AgentTabKind.Sensorium)}
        >
          Sensorium
        </button>
      </div>

      {tab === AgentTabKind.Profile && (
        <AgentForm tree={tree} agentId={agentId} onSaved={onSaved} onDeleted={onDeleted} />
      )}
      {tab === AgentTabKind.Sensorium && (
        <SensoriumTab worldId={worldId} agentId={agentId} />
      )}
    </div>
  );
}
