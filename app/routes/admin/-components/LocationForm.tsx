import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { EntityHeader } from './EntityHeader';
import { ExitsEditor } from './ExitsEditor';
import { FootnoteBar } from './FootnoteBar';
import { KeyVisualPanel } from './KeyVisualPanel';
import { ManuscriptCard } from './ManuscriptCard';
import { MetadataColumn } from './MetadataColumn';
import { TagsPanel } from './TagsPanel';
import { TriggersEditor } from './TriggersEditor';

export interface LocationFormProps {
  readonly tree: WorldTree;
  readonly locationId: string;
  readonly problemCount: number;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
}

export function LocationForm({
  tree,
  locationId,
  problemCount,
  onSaved,
  onDeleted,
}: LocationFormProps) {
  const loc = tree.locations.find((l) => (l.id as string) === locationId);
  const initial = loc
    ? {
        id: loc.id as string,
        label: loc.label,
        shortDescription: loc.shortDescription,
        longDescription: loc.longDescription,
        tags: loc.tags,
      }
    : null;
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);

  if (!loc || !v) return <p className="t-metadata">Location not found.</p>;

  const wordCount =
    v.longDescription.trim() === '' ? 0 : v.longDescription.trim().split(/\s+/).length;
  const charCount = v.longDescription.length;

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      await saveEntity({
        data: {
          worldId: tree.summary.id as string,
          entity: EntityKind.Location,
          payload: v,
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const exitsHere = tree.exits.filter((e) => (e.from as string) === locationId);
  const triggersHere = tree.triggers.filter((t) => (t.locationId as string) === locationId);

  return (
    <>
      <EntityHeader kindLabel="Location" title={v.label || v.id} id={v.id} />
      <div className="form-grid">
        <div className="form-grid__primary">
          <div>
            <label htmlFor="loc-label" className="form-grid__field-label">
              Label
            </label>
            <input
              id="loc-label"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="loc-short" className="form-grid__field-label">
              Short Description
            </label>
            <input
              id="loc-short"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--italic"
              value={v.shortDescription}
              onChange={(e) => setV({ ...v, shortDescription: e.target.value })}
            />
          </div>
          <div>
            <span className="form-grid__field-label">Long Description</span>
            <ManuscriptCard
              value={v.longDescription}
              onChange={(next) => setV({ ...v, longDescription: next })}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              Save
            </button>
          </div>
        </div>
        <MetadataColumn>
          <KeyVisualPanel
            src={tree.summary.coverImageUrl}
            fallbackLetter={(v.label[0] ?? '?').toUpperCase()}
            editable={false}
          />
          <div>
            <span className="form-grid__field-label">Attributes &amp; Tags</span>
            <TagsPanel tags={v.tags} onChange={(next) => setV({ ...v, tags: next })} />
          </div>
        </MetadataColumn>
      </div>

      <ExitsEditor
        worldId={tree.summary.id as string}
        sourceLocationId={locationId}
        exits={exitsHere}
        locations={tree.locations}
        items={tree.items}
        onChanged={onSaved}
      />

      <TriggersEditor
        worldId={tree.summary.id as string}
        sourceLocationId={locationId}
        triggers={triggersHere}
        templates={tree.templates}
        onChanged={onSaved}
      />

      <FootnoteBar
        wordCount={wordCount}
        charCount={charCount}
        problemCount={problemCount}
        onDelete={async () => {
          await deleteEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Location,
              id: v.id,
            },
          });
          onDeleted();
        }}
      />
    </>
  );
}
