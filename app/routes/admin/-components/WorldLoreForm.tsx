import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { updateWorldLore } from '~/server/admin/lore';
import { EntityHeader } from './EntityHeader';
import { FootnoteBar } from './FootnoteBar';

export interface WorldLoreFormProps {
  readonly tree: WorldTree;
  readonly problemCount: number;
  readonly onSaved: () => void;
}

export function WorldLoreForm({ tree, problemCount, onSaved }: WorldLoreFormProps) {
  const [worldOverview, setWorldOverview] = useState(tree.worldLore.worldOverview);
  const [storySoFar, setStorySoFar] = useState(tree.worldLore.storySoFar);
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await updateWorldLore({
        data: { id: tree.summary.id as string, worldOverview, storySoFar },
      });
      if (!r.ok) {
        alert(`Save failed: ${r.error.message}`);
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const combined = `${worldOverview}\n${storySoFar}`;
  const wordCount = combined.trim() === '' ? 0 : combined.trim().split(/\s+/).length;
  const charCount = combined.length;

  return (
    <>
      <EntityHeader kindLabel="World Lore" title="World lore" />
      <div className="form-grid">
        <div className="form-grid__primary">
          <div>
            <label htmlFor="wl-overview" className="form-grid__field-label">
              World overview
            </label>
            <textarea
              id="wl-overview"
              className="manuscript-input-v2"
              rows={6}
              value={worldOverview}
              onChange={(e) => setWorldOverview(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="wl-story" className="form-grid__field-label">
              Story so far
            </label>
            <p className="t-metadata" style={{ fontStyle: 'italic', margin: '0 0 var(--s-2) 0' }}>
              Auto-updated by the engine. You can edit freely.
            </p>
            <textarea
              id="wl-story"
              className="manuscript-input-v2"
              rows={10}
              value={storySoFar}
              onChange={(e) => setStorySoFar(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              Save
            </button>
          </div>
        </div>
      </div>
      <FootnoteBar wordCount={wordCount} charCount={charCount} problemCount={problemCount} />
    </>
  );
}
