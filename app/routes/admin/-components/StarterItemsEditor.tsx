import { StarterPackEntryKind } from '@core/domain/builder-kinds';
import type { StarterPackEntry } from '@core/domain/builder-types';

export interface StarterItemsEditorProps {
  readonly entries: readonly StarterPackEntry[];
  readonly onChange: (next: readonly StarterPackEntry[]) => void;
}

export function StarterItemsEditor({ entries, onChange }: StarterItemsEditorProps) {
  const update = (idx: number, patch: Partial<StarterPackEntry>): void => {
    const next = entries.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    onChange(next);
  };
  const remove = (idx: number): void => onChange(entries.filter((_, i) => i !== idx));
  const add = (): void =>
    onChange([
      ...entries,
      {
        kind: StarterPackEntryKind.Inline,
        label: '',
        shortDescription: '',
        longDescription: '',
        weight: 1,
        hidden: false,
      },
    ]);

  return (
    <section className="sub-section">
      <header className="sub-section__heading">
        <h3 className="sub-section__title">Starting items ({entries.length})</h3>
        <button type="button" className="btn" onClick={add}>
          Add starter item
        </button>
      </header>
      {entries.length === 0 ? (
        <p className="t-metadata" style={{ fontStyle: 'italic' }}>
          No starting items.
        </p>
      ) : (
        entries.map((e, idx) => (
          <div key={`${idx}-${e.label}`} className="row-editor">
            <div className="row-editor__grid">
              <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
                <label className="row-editor__field-label" htmlFor={`si-label-${idx}`}>
                  Label
                </label>
                <input
                  id={`si-label-${idx}`}
                  type="text"
                  className="row-editor__input"
                  value={e.label}
                  onChange={(ev) => update(idx, { label: ev.target.value })}
                />
              </div>
              <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
                <label className="row-editor__field-label" htmlFor={`si-weight-${idx}`}>
                  Weight
                </label>
                <input
                  id={`si-weight-${idx}`}
                  type="number"
                  className="row-editor__input"
                  value={e.weight}
                  onChange={(ev) => update(idx, { weight: Number(ev.target.value) })}
                />
              </div>
              <label className="row-editor__checkbox" style={{ gridColumn: 'span 3' }}>
                <input
                  type="checkbox"
                  checked={e.hidden}
                  onChange={(ev) => update(idx, { hidden: ev.target.checked })}
                />
                Hidden
              </label>
              <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
                <label className="row-editor__field-label" htmlFor={`si-short-${idx}`}>
                  Short description
                </label>
                <input
                  id={`si-short-${idx}`}
                  type="text"
                  className="row-editor__input"
                  value={e.shortDescription}
                  onChange={(ev) => update(idx, { shortDescription: ev.target.value })}
                />
              </div>
              <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
                <label className="row-editor__field-label" htmlFor={`si-long-${idx}`}>
                  Long description
                </label>
                <input
                  id={`si-long-${idx}`}
                  type="text"
                  className="row-editor__input"
                  value={e.longDescription}
                  onChange={(ev) => update(idx, { longDescription: ev.target.value })}
                />
              </div>
            </div>
            <div className="row-editor__actions">
              <button type="button" className="btn" onClick={() => remove(idx)}>
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
