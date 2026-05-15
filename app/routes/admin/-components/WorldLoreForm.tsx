import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { updateWorldLore } from '~/server/admin/lore';
import { EntityHeader } from './EntityHeader';
import { FootnoteBar } from './FootnoteBar';
import { SaveStatus, useSaveStatus } from './useSaveStatus';

export interface WorldLoreFormProps {
  readonly tree: WorldTree;
  readonly onSaved: () => Promise<void> | void;
}

export function WorldLoreForm({ tree, onSaved }: WorldLoreFormProps) {
  const [worldOverview, setWorldOverview] = useState(tree.worldLore.worldOverview);
  const [storySoFar, setStorySoFar] = useState(tree.worldLore.storySoFar);
  const { status, label, run, dirty, markDirty } = useSaveStatus();
  const saving = status === SaveStatus.Saving;

  const save = async (): Promise<void> => {
    await run(async () => {
      const r = await updateWorldLore({
        data: { id: tree.summary.id as string, worldOverview, storySoFar },
      });
      if (!r.ok) {
        alert(`Save failed: ${r.error.message}`);
        throw new Error(r.error.message);
      }
      await onSaved();
    });
  };

  return (
    <>
      <EntityHeader kindLabel="World Lore" title="World lore" />
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
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
              onChange={(e) => { setWorldOverview(e.target.value); markDirty(); }}
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
              onChange={(e) => { setStorySoFar(e.target.value); markDirty(); }}
            />
          </div>
        </div>
      </form>
      <FootnoteBar
        dirty={dirty}
        onSave={save}
        saveLabel={label}
        saveDisabled={saving}
      />
    </>
  );
}
