import { WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import {
  loadStartingState,
  resetLiveFromStartingState,
  saveStartingState,
  setWorldPlayerAgent,
  silenceAllAgents,
  updateWorldCover,
} from '~/server/admin/worlds';
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
  const isScratch = tree.summary.kind === WorldKind.Draft;
  const worldId = tree.summary.id as string;

  const counts = `${tree.locations.length} locations, ${tree.items.length} items, ${tree.agents.length} agents, ${tree.tagLore.length} tag-lore rows`;

  const onSaveStartingState = async (): Promise<void> => {
    if (busy) return;
    if (!confirm(`Replace starting state with current world state? (${counts}.)`)) return;
    setBusy(true);
    try {
      const r = await saveStartingState({ data: { id: worldId } });
      if (!r.ok) {
        alert(`Save failed: ${r.error.message}`);
        return;
      }
      alert('Starting state saved.');
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const onLoadStartingState = async (): Promise<void> => {
    if (busy) return;
    if (
      !confirm(
        'Discard current edits and reload starting state? This wipes your in-progress changes.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await loadStartingState({ data: { id: worldId } });
      if (!r.ok) {
        alert(`Load failed: ${r.error.message}`);
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const onResetLive = async (): Promise<void> => {
    if (busy) return;
    if (
      !confirm(
        'Reset live world to the saved starting state? This wipes gameplay progress and replaces it with the starting state.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await resetLiveFromStartingState({ data: { id: worldId } });
      if (!r.ok) {
        alert(`Reset failed: ${r.error.message}`);
        return;
      }
      alert('Live world reset to starting state.');
      onSaved();
    } finally {
      setBusy(false);
    }
  };

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
            <span className="form-grid__field-label">Player agent</span>
            <p className="t-metadata" style={{ margin: '0 0 var(--s-2) 0' }}>
              The agent the game treats as the player.
            </p>
            <select
              className="manuscript-input-v2"
              value={(tree.summary.playerAgentId as string | null) ?? ''}
              disabled={busy}
              onChange={async (e) => {
                const next = e.target.value === '' ? null : e.target.value;
                setBusy(true);
                try {
                  const r = await setWorldPlayerAgent({
                    data: { id: tree.summary.id as string, playerAgentId: next },
                  });
                  if (!r.ok) {
                    alert('Failed to set player agent.');
                    return;
                  }
                  onSaved();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <option value="">(none)</option>
              {tree.agents.map((a) => (
                <option key={a.id as string} value={a.id as string}>
                  {a.label} — {a.id as string}
                </option>
              ))}
            </select>
          </div>

          {isScratch ? (
            <div style={{ marginTop: 'var(--s-4)' }}>
              <span className="form-grid__field-label">Starting state</span>
              <p className="t-metadata" style={{ margin: '0 0 var(--s-2) 0' }}>
                Save commits this scratch world as the starting-state blob. Load wipes the scratch
                and reloads from the blob. Reset live wipes the paired live world and replaces it
                with the starting state.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn" onClick={onSaveStartingState} disabled={busy}>
                  Save starting state
                </button>
                <button type="button" className="btn" onClick={onLoadStartingState} disabled={busy}>
                  Load starting state
                </button>
                <button type="button" className="btn" onClick={onResetLive} disabled={busy}>
                  Reset live
                </button>
              </div>
            </div>
          ) : null}

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
              {busy
                ? 'Silencing…'
                : `Silence all NPCs${activeCount > 0 ? ` (${activeCount})` : ''}`}
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
