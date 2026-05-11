import { useState } from 'react';

export interface KeyVisualPanelProps {
  readonly src: string | null;
  readonly fallbackLetter: string;
  readonly editable: boolean;
  readonly onChange?: (next: string | null) => Promise<void>;
}

export function KeyVisualPanel({ src, fallbackLetter, editable, onChange }: KeyVisualPanelProps) {
  const [draft, setDraft] = useState(src ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    if (!onChange || saving) return;
    setSaving(true);
    try {
      await onChange(draft.trim() === '' ? null : draft.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="form-grid__field-label">Key Visual</div>
      <div className="key-visual">
        {src ? (
          <img className="key-visual__img" src={src} alt="" />
        ) : (
          <div className="key-visual__placeholder">{fallbackLetter}</div>
        )}
      </div>
      {editable ? (
        <div className="key-visual__url-row">
          <input
            type="text"
            className="manuscript-input-v2"
            placeholder="https://… (leave blank to clear)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" className="btn" onClick={save} disabled={saving}>
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
}
