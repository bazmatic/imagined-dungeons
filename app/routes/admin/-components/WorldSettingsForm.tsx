import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { silenceAllAgents, updateWorldCover } from '~/server/admin/worlds';
import { EntityHeader } from './EntityHeader';
import { KeyVisualPanel } from './KeyVisualPanel';
import { MetadataColumn } from './MetadataColumn';

export interface WorldSettingsFormProps {
  readonly tree: WorldTree;
  readonly onSaved: () => void;
}

export function WorldSettingsForm({ tree, onSaved }: WorldSettingsFormProps) {
  const name = tree.summary.displayName || tree.summary.label;
  const activeCount = tree.agents.filter((a) => a.autonomous || a.awake).length;
  const [busy, setBusy] = useState(false);

  const silence = async (): Promise<void> => {
    if (busy) return;
    if (
      !confirm(
        `Silence all NPCs (clear autonomous + awake) on every agent in this world? (${activeCount} currently active)`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await silenceAllAgents({ data: { id: tree.summary.id as string } });
      if (!r.ok) {
        alert(`Failed: ${(r as { error?: { message: string } }).error?.message ?? 'unknown'}`);
        return;
      }
      alert(`Silenced ${r.value.changed} of ${r.value.total} agents.`);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <EntityHeader kindLabel="World" title={name} id={tree.summary.id as string} />
      <div className="form-grid">
        <div className="form-grid__primary">
          <p className="t-metadata" style={{ fontStyle: 'italic' }}>
            World-level settings. Cover art appears on the campaign builder and on the world's
            key-visual panel.
          </p>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <span className="form-grid__field-label">Silence NPCs</span>
            <p className="t-metadata" style={{ margin: '0 0 var(--s-2) 0' }}>
              {activeCount} of {tree.agents.length} agents are currently active (autonomous or
              awake). Silencing clears both flags so they will not tick until something wakes them
              again.
            </p>
            <button
              type="button"
              className="btn"
              onClick={silence}
              disabled={busy || activeCount === 0}
            >
              {busy ? 'Silencing…' : `Silence all NPCs${activeCount > 0 ? ` (${activeCount})` : ''}`}
            </button>
          </div>
        </div>
        <MetadataColumn>
          <KeyVisualPanel
            src={tree.summary.coverImageUrl}
            fallbackLetter={(name[0] ?? '?').toUpperCase()}
            editable
            onChange={async (next) => {
              await updateWorldCover({
                data: { id: tree.summary.id as string, coverImageUrl: next },
              });
              onSaved();
            }}
          />
        </MetadataColumn>
      </div>
    </>
  );
}
