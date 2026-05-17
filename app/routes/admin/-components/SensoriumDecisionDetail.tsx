import type { NpcDecision } from '@core/domain/npc-decision';
import { SensoriumSection } from './SensoriumSection';

interface SensoriumDecisionDetailProps {
  readonly decision: NpcDecision;
}

export function SensoriumDecisionDetail({ decision }: SensoriumDecisionDetailProps) {
  const { snapshot, rawPrompt, createdAt } = decision;
  const { agentState, perception, memory, response } = snapshot;

  return (
    <div className="sensorium-detail">
      <div className="sensorium-detail__meta t-metadata">
        {new Date(createdAt).toLocaleString()}
        {snapshot.fallback ? ' — fallback (LLM unavailable)' : ''}
      </div>

      <SensoriumSection title="Agent State" defaultOpen>
        <dl className="sensorium-dl">
          <dt>Mood</dt><dd>{agentState.mood ?? '—'}</dd>
          <dt>Goal</dt><dd>{agentState.goal ?? '—'}</dd>
          <dt>Short-term intent</dt><dd>{agentState.shortTermIntent ?? '—'}</dd>
        </dl>
      </SensoriumSection>

      <SensoriumSection title="Perception" defaultOpen>
        <dl className="sensorium-dl">
          <dt>Location</dt>
          <dd>{perception.locationLabel}{perception.locationDescription ? ` — ${perception.locationDescription}` : ''}</dd>
          <dt>Agents here</dt>
          <dd>{perception.visibleAgents.length > 0
            ? perception.visibleAgents.map((a) => a.mood ? `${a.label} (${a.mood})` : a.label).join(', ')
            : '—'}
          </dd>
          <dt>Items</dt>
          <dd>{perception.visibleItems.length > 0 ? perception.visibleItems.join(', ') : '—'}</dd>
          <dt>Exits</dt>
          <dd>{perception.exits.length > 0
            ? perception.exits.map((e) => `${e.direction}${e.locked ? ' [locked]' : ''}`).join(', ')
            : '—'}
          </dd>
          <dt>Carrying</dt>
          <dd>{perception.inventory.length > 0 ? perception.inventory.join(', ') : '—'}</dd>
          {perception.unansweredAddresses.length > 0 && (
            <>
              <dt>Addressed (unanswered)</dt>
              <dd>
                <ul className="sensorium-list-inline">
                  {perception.unansweredAddresses.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </dd>
            </>
          )}
        </dl>
      </SensoriumSection>

      <SensoriumSection title={`Memory (${memory.length} events)`} defaultOpen>
        {memory.length > 0 ? (
          <ul className="sensorium-memory">
            {memory.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        ) : <p className="t-metadata">No memory events.</p>}
      </SensoriumSection>

      <SensoriumSection title="Response" defaultOpen>
        <dl className="sensorium-dl">
          <dt>Thought</dt><dd><em>{response.thought ?? '—'}</em></dd>
          <dt>Intent change</dt>
          <dd>{response.intentBefore === response.intentAfter
            ? (response.intentAfter ?? 'none')
            : `${response.intentBefore ?? 'none'} → ${response.intentAfter ?? 'none'}`}
          </dd>
          <dt>Actions</dt>
          <dd>{response.actions.length > 0 ? response.actions.join(' / ') : '(wait)'}</dd>
        </dl>
      </SensoriumSection>

      <SensoriumSection title="Raw Prompt" defaultOpen={false}>
        <div className="sensorium-raw">
          <div className="sensorium-raw__label">System</div>
          <pre className="sensorium-raw__body">{rawPrompt.system}</pre>
          <div className="sensorium-raw__label">User</div>
          <pre className="sensorium-raw__body">{rawPrompt.user}</pre>
        </div>
      </SensoriumSection>
    </div>
  );
}
