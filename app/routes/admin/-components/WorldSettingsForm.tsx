import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { disableAllAgentAutonomy, updateWorldCover } from '~/server/admin/worlds';
import { EntityHeader } from './EntityHeader';
import { KeyVisualPanel } from './KeyVisualPanel';
import { MetadataColumn } from './MetadataColumn';

export interface WorldSettingsFormProps {
  readonly tree: WorldTree;
  readonly onSaved: () => void;
}

export function WorldSettingsForm({ tree, onSaved }: WorldSettingsFormProps) {
  const name = tree.summary.displayName || tree.summary.label;
  const autonomousCount = tree.agents.filter((a) => a.autonomous).length;
  const [busy, setBusy] = useState(false);

  const disableAutonomy = async (): Promise<void> => {
    if (busy) return;
    if (
      !confirm(
        `Set autonomous=false on every agent in this world? (${autonomousCount} currently autonomous)`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await disableAllAgentAutonomy({ data: { id: tree.summary.id as string } });
      if (!r.ok) {
        alert(`Failed: ${(r as { error?: { message: string } }).error?.message ?? 'unknown'}`);
        return;
      }
      alert(`Disabled autonomy on ${r.value.changed} of ${r.value.total} agents.`);
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
            <span className="form-grid__field-label">NPC autonomy</span>
            <p className="t-metadata" style={{ margin: '0 0 var(--s-2) 0' }}>
              {autonomousCount} of {tree.agents.length} agents are currently autonomous (they act
              every tick they share a location with the player).
            </p>
            <button
              type="button"
              className="btn"
              onClick={disableAutonomy}
              disabled={busy || autonomousCount === 0}
            >
              {busy ? 'Disabling…' : `Disable NPC autonomy${autonomousCount > 0 ? ` (${autonomousCount})` : ''}`}
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
