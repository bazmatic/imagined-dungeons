import { useState } from 'react';
import { addTag, removeTag, sanitizeTag } from './tags-codec';

export interface TagsPanelProps {
  readonly tags: readonly string[];
  readonly onChange: (tags: readonly string[]) => void;
}

export function TagsPanel({ tags, onChange }: TagsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = (): void => {
    const sanitized = sanitizeTag(draft);
    if (sanitized !== null) onChange(addTag(tags, sanitized));
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="tags-panel">
      {tags.map((t) => (
        <span key={t} className="tag-chip">
          {t}
          <button
            type="button"
            className="tag-chip__remove"
            onClick={() => onChange(removeTag(tags, t))}
            aria-label={`Remove ${t}`}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <span className="tag-chip tag-chip--add">
          <input
            // biome-ignore lint/a11y/noAutofocus: inline edit affordance — focus is the user-expected effect of clicking "+ Add tag"
            autoFocus
            className="tag-chip__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
          />
        </span>
      ) : (
        <button type="button" className="tag-chip tag-chip--add" onClick={() => setAdding(true)}>
          + Add tag
        </button>
      )}
    </div>
  );
}
