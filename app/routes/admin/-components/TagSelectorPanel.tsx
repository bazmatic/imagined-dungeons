import { useMemo, useState } from 'react';
import { addTag, removeTag } from './tags-codec';

export interface TagSelectorPanelProps {
  readonly tags: readonly string[];
  readonly availableTags: readonly string[];
  readonly onChange: (tags: readonly string[]) => void;
}

/**
 * Pure helper: filter the authored vocabulary by `query` (case-insensitive
 * substring), excluding tags already attached. Exported for unit testing.
 */
export function filterSuggestions(
  available: readonly string[],
  attached: readonly string[],
  query: string,
): readonly string[] {
  const q = query.trim().toLowerCase();
  if (q === '') return available.filter((t) => !attached.includes(t));
  return available.filter((t) => !attached.includes(t) && t.toLowerCase().includes(q));
}

export function TagSelectorPanel({ tags, availableTags, onChange }: TagSelectorPanelProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const authoredSet = useMemo(() => new Set(availableTags), [availableTags]);
  const suggestions = useMemo(
    () => filterSuggestions(availableTags, tags, draft),
    [availableTags, tags, draft],
  );

  const closeInput = (): void => {
    setDraft('');
    setAdding(false);
  };

  const tryCommit = (raw: string): void => {
    const candidate = raw.trim().toLowerCase();
    if (candidate === '') {
      closeInput();
      return;
    }
    if (!authoredSet.has(candidate)) return;
    onChange(addTag(tags, candidate));
    closeInput();
  };

  const exactMatch = draft.trim() !== '' && authoredSet.has(draft.trim().toLowerCase());
  const noMatches = draft.trim() !== '' && suggestions.length === 0;

  return (
    <div className="tags-panel">
      {tags.map((t) => {
        const orphan = !authoredSet.has(t);
        return (
          <span key={t} className="tag-chip">
            {t}
            {orphan ? (
              <em
                className="tag-chip__orphan"
                style={{ marginLeft: 4, opacity: 0.6, fontStyle: 'italic', fontSize: '0.85em' }}
              >
                (unauthored)
              </em>
            ) : null}
            <button
              type="button"
              className="tag-chip__remove"
              onClick={() => onChange(removeTag(tags, t))}
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        );
      })}
      {availableTags.length === 0 ? (
        <span className="tag-chip tag-chip--add" style={{ fontStyle: 'italic' }}>
          No tags authored yet —{' '}
          <a href="?cat=lore" style={{ marginLeft: 4 }}>
            author tags in Lore
          </a>
        </span>
      ) : adding ? (
        <span
          className="tag-chip tag-chip--add tag-typeahead"
          style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column' }}
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: inline edit affordance — focus is the user-expected effect of clicking "+ Add tag"
            autoFocus
            className="tag-chip__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (exactMatch) {
                  tryCommit(draft);
                } else if (suggestions.length === 1) {
                  tryCommit(suggestions[0] ?? '');
                }
              }
              if (e.key === 'Escape') closeInput();
            }}
          />
          {suggestions.length > 0 ? (
            <ul
              className="tag-typeahead__list"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                margin: 0,
                padding: 4,
                listStyle: 'none',
                background: 'var(--surface, #fff)',
                border: '1px solid var(--border, #ccc)',
                borderRadius: 4,
                zIndex: 10,
                minWidth: 160,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className="tag-typeahead__suggestion"
                    onMouseDown={(e) => {
                      // mousedown beats blur so the click registers before the input loses focus
                      e.preventDefault();
                      tryCommit(s);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '4px 8px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {noMatches ? (
            <span
              className="tag-typeahead__hint"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 2,
                fontSize: '0.8em',
                opacity: 0.7,
                whiteSpace: 'nowrap',
              }}
            >
              No tag matches. <a href="?cat=lore">Author tags in the Lore section.</a>
            </span>
          ) : null}
        </span>
      ) : (
        <button type="button" className="tag-chip tag-chip--add" onClick={() => setAdding(true)}>
          + Add tag
        </button>
      )}
    </div>
  );
}
