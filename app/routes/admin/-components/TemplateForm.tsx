import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { deleteTemplate, upsertTemplate } from '~/server/admin/templates';
import { EntityHeader } from './EntityHeader';
import { FootnoteBar } from './FootnoteBar';
import { ManuscriptCard } from './ManuscriptCard';
import { MetadataColumn } from './MetadataColumn';
import { StarterItemsEditor } from './StarterItemsEditor';
import { TagSelectorPanel } from './TagSelectorPanel';
import { SaveStatus, useSaveStatus } from './useSaveStatus';

export interface TemplateFormProps {
  readonly tree: WorldTree;
  readonly templateId: string;
  readonly onSaved: () => Promise<void> | void;
  readonly onDeleted: () => void;
}

export function TemplateForm({ tree, templateId, onSaved, onDeleted }: TemplateFormProps) {
  const tpl = tree.templates.find((t) => (t.id as string) === templateId);
  const [v, setV] = useState(
    tpl
      ? {
          id: tpl.id as string,
          templateKey: tpl.templateKey,
          label: tpl.label,
          labelPrefixInstructions: tpl.labelPrefixInstructions ?? '',
          shortDescription: tpl.shortDescription,
          longDescription: tpl.longDescription,
          hpMin: tpl.hpMin,
          hpMax: tpl.hpMax,
          mood: tpl.mood ?? '',
          startingItems: tpl.startingItems,
          tags: tpl.tags,
        }
      : null,
  );
  const { status, label, run, dirty, markDirty } = useSaveStatus();
  const saving = status === SaveStatus.Saving;

  if (!tpl || !v) return <p className="t-metadata">Template not found.</p>;

  const update = (patch: Partial<typeof v>): void => {
    setV({ ...v, ...patch });
    markDirty();
  };

  const authoredTags = [...tree.tagLore.map((t) => t.tag)].sort((a, b) => a.localeCompare(b));

  const save = async (): Promise<void> => {
    await run(async () => {
      await upsertTemplate({
        data: {
          worldId: tree.summary.id as string,
          payload: {
            id: v.id,
            templateKey: v.templateKey,
            label: v.label,
            labelPrefixInstructions: v.labelPrefixInstructions === '' ? null : v.labelPrefixInstructions,
            shortDescription: v.shortDescription,
            longDescription: v.longDescription,
            hpMin: v.hpMin,
            hpMax: v.hpMax,
            mood: v.mood === '' ? null : v.mood,
            startingItems: v.startingItems,
            tags: v.tags,
          },
        },
      });
      await onSaved();
    });
  };

  return (
    <>
      <EntityHeader kindLabel="Monster Template" title={v.label || v.id} id={v.id} />
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="form-grid__primary">
          <div>
            <label htmlFor="tpl-label" className="form-grid__field-label">
              Label
            </label>
            <input
              id="tpl-label"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={v.label}
              onChange={(e) => update({ label: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="tpl-label-prefix" className="form-grid__field-label">
              Label Prefix Instructions
            </label>
            <textarea
              id="tpl-label-prefix"
              className="manuscript-input-v2"
              rows={3}
              value={v.labelPrefixInstructions}
              placeholder="LLM instructions for generating a unique prefix per spawn, e.g. 'Generate a short physical/personality descriptor in square brackets'"
              onChange={(e) => setV({ ...v, labelPrefixInstructions: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="tpl-key" className="form-grid__field-label">
              Template key (read-only)
            </label>
            <input
              id="tpl-key"
              type="text"
              className="manuscript-input-v2 input--readonly"
              value={v.templateKey}
              readOnly
            />
          </div>
          <div>
            <label htmlFor="tpl-short" className="form-grid__field-label">
              Short description
            </label>
            <input
              id="tpl-short"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--italic"
              value={v.shortDescription}
              onChange={(e) => update({ shortDescription: e.target.value })}
            />
          </div>
          <div>
            <span className="form-grid__field-label">Long description</span>
            <ManuscriptCard
              value={v.longDescription}
              onChange={(next) => update({ longDescription: next })}
            />
          </div>
        </div>
        <MetadataColumn>
          <div className="row-editor__grid" style={{ gap: 'var(--s-4)' }}>
            <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
              <label className="row-editor__field-label" htmlFor="tpl-hp-min">
                HP Min
              </label>
              <input
                id="tpl-hp-min"
                type="number"
                className="row-editor__input"
                value={v.hpMin}
                min={1}
                onChange={(e) => setV({ ...v, hpMin: Number(e.target.value) })}
              />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
              <label className="row-editor__field-label" htmlFor="tpl-hp-max">
                HP Max
              </label>
              <input
                id="tpl-hp-max"
                type="number"
                className="row-editor__input"
                value={v.hpMax}
                min={1}
                onChange={(e) => setV({ ...v, hpMax: Number(e.target.value) })
              />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
              <label className="row-editor__field-label" htmlFor="tpl-mood">
                Mood
              </label>
              <input
                id="tpl-mood"
                type="text"
                className="row-editor__input"
                value={v.mood}
                placeholder="(optional)"
                onChange={(e) => update({ mood: e.target.value })}
              />
            </div>
          </div>
          <div>
            <span className="form-grid__field-label">Attributes &amp; Tags</span>
            <TagSelectorPanel
              tags={v.tags}
              availableTags={authoredTags}
              onChange={(next) => update({ tags: next })}
            />
          </div>
        </MetadataColumn>
      </form>

      <StarterItemsEditor
        entries={v.startingItems}
        onChange={(next) => update({ startingItems: next })}
      />

      <FootnoteBar
        dirty={dirty}
        onSave={save}
        saveLabel={label}
        saveDisabled={saving}
        onDelete={async () => {
          await deleteTemplate({
            data: { worldId: tree.summary.id as string, id: v.id },
          });
          onDeleted();
        }}
      />
    </>
  );
}
