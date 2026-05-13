import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';
import { useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { EntityHeader } from './EntityHeader';
import { FootnoteBar } from './FootnoteBar';
import { ManuscriptCard } from './ManuscriptCard';
import { MetadataColumn } from './MetadataColumn';
import { TagSelectorPanel } from './TagSelectorPanel';
import { SaveStatus, useSaveStatus } from './useSaveStatus';

type ItemOwnerKind =
  | typeof OwnerKind.Location
  | typeof OwnerKind.Agent
  | typeof OwnerKind.Item;

export interface ItemFormProps {
  readonly tree: WorldTree;
  readonly itemId: string;
  readonly problemCount: number;
  readonly onSaved: () => Promise<void> | void;
  readonly onDeleted: () => void;
}

export function ItemForm({ tree, itemId, problemCount, onSaved, onDeleted }: ItemFormProps) {
  const item = tree.items.find((i) => (i.id as string) === itemId);
  const [v, setV] = useState(
    item
      ? {
          id: item.id as string,
          label: item.label,
          shortDescription: item.shortDescription,
          longDescription: item.longDescription,
          ownerKind: item.owner.kind as ItemOwnerKind,
          ownerId: item.owner.id as string,
          weight: item.weight,
          hidden: item.hidden,
          tags: item.tags,
          container: item.container,
          opened: item.opened,
          locked: item.locked,
          lockedByItem: (item.lockedByItem as string | null) ?? null,
        }
      : null,
  );
  const { status, label, run } = useSaveStatus();
  const saving = status === SaveStatus.Saving;

  if (!item || !v) return <p className="t-metadata">Item not found.</p>;

  const authoredTags = [...tree.tagLore.map((t) => t.tag)].sort((a, b) => a.localeCompare(b));

  const wordCount =
    v.longDescription.trim() === '' ? 0 : v.longDescription.trim().split(/\s+/).length;
  const charCount = v.longDescription.length;

  const save = async (): Promise<void> => {
    if (v.ownerId === '') return;
    await run(async () => {
      await saveEntity({
        data: {
          worldId: tree.summary.id as string,
          entity: EntityKind.Item,
          payload: {
            id: v.id,
            label: v.label,
            shortDescription: v.shortDescription,
            longDescription: v.longDescription,
            ownerKind: v.ownerKind,
            ownerId: v.ownerId,
            weight: v.weight,
            hidden: v.hidden,
            tags: v.tags,
            container: v.container,
            opened: v.opened,
            locked: v.locked,
            lockedByItem: v.locked ? v.lockedByItem : null,
          },
        },
      });
      await onSaved();
    });
  };

  const ownerOptions =
    v.ownerKind === OwnerKind.Location
      ? tree.locations.map((l) => ({ id: l.id as string, label: l.label }))
      : v.ownerKind === OwnerKind.Agent
        ? tree.agents.map((a) => ({ id: a.id as string, label: a.label }))
        : tree.items
            .filter((i) => (i.id as string) !== v.id)
            .map((i) => ({ id: i.id as string, label: i.label }));
  const otherItems = tree.items.filter((i) => (i.id as string) !== v.id);

  return (
    <>
      <EntityHeader kindLabel="Item" title={v.label || v.id} id={v.id} />
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="form-grid__primary">
          <div>
            <label htmlFor="it-label" className="form-grid__field-label">
              Label
            </label>
            <input
              id="it-label"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
            />
          </div>
          <div className="row-editor__grid">
            <div className="row-editor__field" style={{ gridColumn: 'span 4' }}>
              <span className="row-editor__field-label">Owner kind</span>
              <label className="row-editor__checkbox">
                <input
                  type="radio"
                  name="owner-kind"
                  checked={v.ownerKind === OwnerKind.Location}
                  onChange={() => setV({ ...v, ownerKind: OwnerKind.Location, ownerId: '' })}
                />
                Location
              </label>
              <label className="row-editor__checkbox">
                <input
                  type="radio"
                  name="owner-kind"
                  checked={v.ownerKind === OwnerKind.Agent}
                  onChange={() => setV({ ...v, ownerKind: OwnerKind.Agent, ownerId: '' })}
                />
                Agent
              </label>
              <label className="row-editor__checkbox">
                <input
                  type="radio"
                  name="owner-kind"
                  checked={v.ownerKind === OwnerKind.Item}
                  onChange={() => setV({ ...v, ownerKind: OwnerKind.Item, ownerId: '' })}
                />
                Item (container)
              </label>
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 8' }}>
              <label className="row-editor__field-label" htmlFor="it-owner">
                Owner
              </label>
              <select
                id="it-owner"
                className="row-editor__select"
                value={v.ownerId}
                onChange={(e) => setV({ ...v, ownerId: e.target.value })}
              >
                <option value="">— pick an owner —</option>
                {ownerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="it-short" className="form-grid__field-label">
              Short Description
            </label>
            <input
              id="it-short"
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
            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving || v.ownerId === ''}
              data-save-status={status}
            >
              {label}
            </button>
          </div>
        </div>
        <MetadataColumn>
          <div className="row-editor__grid" style={{ gap: 'var(--s-4)' }}>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="it-weight">
                Weight
              </label>
              <input
                id="it-weight"
                type="number"
                className="row-editor__input"
                value={v.weight}
                onChange={(e) => setV({ ...v, weight: Number(e.target.value) })}
              />
            </div>
            <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
              <input
                type="checkbox"
                checked={v.hidden}
                onChange={(e) => setV({ ...v, hidden: e.target.checked })}
              />
              Hidden
            </label>
            <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
              <input
                type="checkbox"
                checked={v.container}
                onChange={(e) =>
                  setV({
                    ...v,
                    container: e.target.checked,
                    // Reset container-only state when toggling off.
                    opened: e.target.checked ? v.opened : true,
                    locked: e.target.checked ? v.locked : false,
                    lockedByItem: e.target.checked ? v.lockedByItem : null,
                  })
                }
              />
              Container
            </label>
            {v.container ? (
              <>
                <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
                  <input
                    type="checkbox"
                    checked={v.opened}
                    onChange={(e) => setV({ ...v, opened: e.target.checked })}
                  />
                  Starts opened
                </label>
                <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
                  <input
                    type="checkbox"
                    checked={v.locked}
                    onChange={(e) =>
                      setV({
                        ...v,
                        locked: e.target.checked,
                        lockedByItem: e.target.checked ? v.lockedByItem : null,
                      })
                    }
                  />
                  Starts locked
                </label>
                {v.locked ? (
                  <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
                    <label className="row-editor__field-label" htmlFor="it-key">
                      Unlocked by
                    </label>
                    <select
                      id="it-key"
                      className="row-editor__select"
                      value={v.lockedByItem ?? ''}
                      onChange={(e) =>
                        setV({
                          ...v,
                          lockedByItem: e.target.value === '' ? null : e.target.value,
                        })
                      }
                    >
                      <option value="">(none)</option>
                      {otherItems.map((i) => (
                        <option key={i.id as string} value={i.id as string}>
                          {i.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          <div>
            <span className="form-grid__field-label">Attributes &amp; Tags</span>
            <TagSelectorPanel
              tags={v.tags}
              availableTags={authoredTags}
              onChange={(next) => setV({ ...v, tags: next })}
            />
          </div>
        </MetadataColumn>
      </form>
      <FootnoteBar
        wordCount={wordCount}
        charCount={charCount}
        problemCount={problemCount}
        onDelete={async () => {
          await deleteEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Item,
              id: v.id,
            },
          });
          onDeleted();
        }}
      />
    </>
  );
}
