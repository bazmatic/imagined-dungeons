import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { deleteTagLore, upsertTagLore } from '~/server/admin/lore';
import { EntityHeader } from './EntityHeader';
import { FootnoteBar } from './FootnoteBar';

export interface TagLoreFormProps {
  readonly tree: WorldTree;
  readonly tag: string;
  readonly problemCount: number;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
}

function randomTagLoreId(): string {
  return `tlr_${Math.random().toString(36).slice(2, 10)}`;
}

export function TagLoreForm({ tree, tag, problemCount, onSaved, onDeleted }: TagLoreFormProps) {
  const existing = tree.tagLore.find((t) => t.tag === tag);
  const [id] = useState<string>(existing ? (existing.id as string) : randomTagLoreId());
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await upsertTagLore({
        data: {
          worldId: tree.summary.id as string,
          payload: { id, tag, title, description },
        },
      });
      if (!r.ok) {
        alert(`Save failed: ${r.error.message}`);
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy || !existing) return;
    setBusy(true);
    try {
      const r = await deleteTagLore({
        data: { worldId: tree.summary.id as string, id: existing.id as string },
      });
      if (!r.ok) {
        alert(`Delete failed: ${r.error.message}`);
        return;
      }
      onDeleted();
    } finally {
      setBusy(false);
    }
  };

  const wordCount = description.trim() === '' ? 0 : description.trim().split(/\s+/).length;
  const charCount = description.length;

  return (
    <>
      <EntityHeader kindLabel="Tag Lore" title={tag} id={id} />
      <div className="form-grid">
        <div className="form-grid__primary">
          <div>
            <span className="form-grid__field-label">Tag</span>
            <input type="text" className="manuscript-input-v2" value={tag} disabled readOnly />
          </div>
          <div>
            <label htmlFor="tl-title" className="form-grid__field-label">
              Title
            </label>
            <input
              id="tl-title"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tl-desc" className="form-grid__field-label">
              Description
            </label>
            <textarea
              id="tl-desc"
              className="manuscript-input-v2"
              rows={12}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
              Save
            </button>
          </div>
        </div>
      </div>
      <FootnoteBar
        wordCount={wordCount}
        charCount={charCount}
        problemCount={problemCount}
        {...(existing ? { onDelete: remove } : {})}
      />
    </>
  );
}
