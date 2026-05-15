import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { EntityHeader } from './EntityHeader';
import { ExitsEditor } from './ExitsEditor';
import { FootnoteBar } from './FootnoteBar';
import { KeyVisualPanel } from './KeyVisualPanel';
import { ManuscriptCard } from './ManuscriptCard';
import { MetadataColumn } from './MetadataColumn';
import { TagSelectorPanel } from './TagSelectorPanel';
import { TriggersEditor } from './TriggersEditor';
import { CategoryKind } from './category-helpers';
import { SaveStatus, useSaveStatus } from './useSaveStatus';

export interface LocationFormProps {
  readonly tree: WorldTree;
  readonly locationId: string;
  readonly onSaved: () => Promise<void> | void;
  readonly onDeleted: () => void;
}

export function LocationForm({ tree, locationId, onSaved, onDeleted }: LocationFormProps) {
  const loc = tree.locations.find((l) => (l.id as string) === locationId);
  const initial = loc
    ? {
        id: loc.id as string,
        label: loc.label,
        shortDescription: loc.shortDescription,
        longDescription: loc.longDescription,
        tags: loc.tags,
        secretDescription: loc.secretDescription ?? '',
      }
    : null;
  const [v, setV] = useState(initial);
  const { status, label, run, dirty, markDirty } = useSaveStatus();
  const saving = status === SaveStatus.Saving;

  if (!loc || !v) return <p className="t-metadata">Location not found.</p>;

  const update = (patch: Partial<typeof v>): void => {
    setV({ ...v, ...patch });
    markDirty();
  };

  const authoredTags = [...tree.tagLore.map((t) => t.tag)].sort((a, b) => a.localeCompare(b));


  const save = async (): Promise<void> => {
    await run(async () => {
      await saveEntity({
        data: {
          worldId: tree.summary.id as string,
          entity: EntityKind.Location,
          payload: v,
        },
      });
      await onSaved();
    });
  };

  const exitsHere = tree.exits.filter((e) => (e.from as string) === locationId);
  const triggersHere = tree.triggers.filter((t) => (t.locationId as string) === locationId);
  const itemsHere = tree.items.filter(
    (it) => it.owner.kind === OwnerKind.Location && (it.owner.id as string) === locationId,
  );
  const agentsHere = tree.agents.filter((a) => (a.locationId as string) === locationId);
  const worldIdString = tree.summary.id as string;

  return (
    <>
      <EntityHeader kindLabel="Location" title={v.label || v.id} id={v.id} />
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
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
              onChange={(e) => update({ label: e.target.value })}
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
              onChange={(e) => update({ shortDescription: e.target.value })}
            />
          </div>
          <div>
            <span className="form-grid__field-label">Long Description</span>
            <ManuscriptCard
              value={v.longDescription}
              onChange={(next) => update({ longDescription: next })}
            />
          </div>
          <div>
            <label htmlFor="loc-secret" className="form-grid__field-label">
              GM-only Notes
            </label>
            <p className="t-metadata" style={{ margin: '0 0 var(--s-2) 0' }}>
              Visible only to the consequence engine — never to the player, the narrator, or NPCs.
              Use for hidden dynamics (factions in disguise, things behind walls, items waiting to
              be discovered). The engine reads these when deciding what to reveal, spawn, or change.
            </p>
            <textarea
              id="loc-secret"
              className="manuscript-input-v2"
              rows={4}
              placeholder="(secret)"
              value={v.secretDescription}
              onChange={(e) => update({ secretDescription: e.target.value })}
            />
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
            <TagSelectorPanel
              tags={v.tags}
              availableTags={authoredTags}
              onChange={(next) => update({ tags: next })}
            />
          </div>
        </MetadataColumn>
      </form>

      {(itemsHere.length > 0 || agentsHere.length > 0) && (
        <section style={{ marginTop: 'var(--s-4)' }}>
          <h3 style={{ marginBottom: 'var(--s-2)' }}>Present here</h3>
          {agentsHere.length > 0 && (
            <div style={{ marginBottom: 'var(--s-3)' }}>
              <span className="form-grid__field-label">Characters</span>
              <ul className="tree-list">
                {agentsHere.map((a) => (
                  <li key={a.id as string}>
                    <Link
                      to="/admin/$worldId"
                      params={{ worldId: worldIdString }}
                      search={{ cat: CategoryKind.Agents, sel: a.id as string }}
                      className="tree-leaf"
                    >
                      {a.label}
                      {a.autonomous ? (
                        <span className="t-metadata" style={{ marginLeft: 8 }}>
                          (autonomous)
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {itemsHere.length > 0 && (
            <div>
              <span className="form-grid__field-label">Items</span>
              <ul className="tree-list">
                {itemsHere.map((it) => (
                  <li key={it.id as string}>
                    <Link
                      to="/admin/$worldId"
                      params={{ worldId: worldIdString }}
                      search={{ cat: CategoryKind.Items, sel: it.id as string }}
                      className="tree-leaf"
                    >
                      {it.label}
                      {it.hidden ? (
                        <span className="t-metadata" style={{ marginLeft: 8 }}>
                          (hidden)
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

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
        dirty={dirty}
        onSave={save}
        saveLabel={label}
        saveDisabled={saving}
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
