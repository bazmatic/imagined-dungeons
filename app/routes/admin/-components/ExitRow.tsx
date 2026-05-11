import type { Exit, Item, Location } from '@core/domain/entities';
import { useState } from 'react';

export interface ExitDraft {
  readonly id: string;
  readonly direction: string;
  readonly label: string;
  readonly toLocationId: string;
  readonly locked: boolean;
  readonly lockedByItemId: string | null;
  readonly isNew: boolean;
}

export interface ExitRowProps {
  readonly draft: ExitDraft;
  readonly sourceLocationId: string;
  readonly locations: readonly Location[];
  readonly items: readonly Item[];
  readonly onSave: (draft: ExitDraft) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
}

export function exitToDraft(e: Exit): ExitDraft {
  return {
    id: e.id as string,
    direction: e.direction,
    label: e.label,
    toLocationId: e.to as string,
    locked: e.locked,
    lockedByItemId: e.lockedByItem === null ? null : (e.lockedByItem as string),
    isNew: false,
  };
}

export function ExitRow({
  draft: initial,
  sourceLocationId,
  locations,
  items,
  onSave,
  onDelete,
}: ExitRowProps) {
  const [v, setV] = useState<ExitDraft>(initial);
  const [busy, setBusy] = useState(false);

  const destinationOptions = locations.filter((l) => (l.id as string) !== sourceLocationId);

  const save = async (): Promise<void> => {
    if (busy) return;
    if (v.direction.trim() === '' || v.toLocationId === '') return;
    setBusy(true);
    try {
      await onSave({ ...v, isNew: false });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete(v.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row-editor">
      <div className="row-editor__grid">
        <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
          <label className="row-editor__field-label" htmlFor={`dir-${v.id}`}>
            Direction
          </label>
          <input
            id={`dir-${v.id}`}
            type="text"
            className="row-editor__input"
            value={v.direction}
            placeholder="north"
            onChange={(e) => setV({ ...v, direction: e.target.value })}
          />
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 4' }}>
          <label className="row-editor__field-label" htmlFor={`dest-${v.id}`}>
            Destination
          </label>
          <select
            id={`dest-${v.id}`}
            className="row-editor__select"
            value={v.toLocationId}
            onChange={(e) => setV({ ...v, toLocationId: e.target.value })}
          >
            <option value="">— pick a location —</option>
            {destinationOptions.map((l) => (
              <option key={l.id as string} value={l.id as string}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
          <label className="row-editor__field-label" htmlFor={`label-${v.id}`}>
            Label
          </label>
          <input
            id={`label-${v.id}`}
            type="text"
            className="row-editor__input"
            placeholder="(optional)"
            value={v.label}
            onChange={(e) => setV({ ...v, label: e.target.value })}
          />
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 2' }}>
          <label className="row-editor__checkbox">
            <input
              type="checkbox"
              checked={v.locked}
              onChange={(e) =>
                setV({
                  ...v,
                  locked: e.target.checked,
                  lockedByItemId: e.target.checked ? v.lockedByItemId : null,
                })
              }
            />
            Locked
          </label>
        </div>
        {v.locked ? (
          <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
            <label className="row-editor__field-label" htmlFor={`key-${v.id}`}>
              Locked by item
            </label>
            <select
              id={`key-${v.id}`}
              className="row-editor__select"
              value={v.lockedByItemId ?? ''}
              onChange={(e) =>
                setV({ ...v, lockedByItemId: e.target.value === '' ? null : e.target.value })
              }
            >
              <option value="">(none)</option>
              {items.map((it) => (
                <option key={it.id as string} value={it.id as string}>
                  {it.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="row-editor__actions">
        {v.isNew ? null : (
          <button type="button" className="btn" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
          {v.isNew ? 'Create' : 'Save'}
        </button>
      </div>
    </div>
  );
}
