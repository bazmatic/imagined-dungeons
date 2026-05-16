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
  readonly onSaved: () => Promise<void> | void;
  readonly onDeleted: () => void;
}

export function ItemForm({ tree, itemId, onSaved, onDeleted }: ItemFormProps) {
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
          priceTag: item.priceTag,
          weaponDamage: item.weaponDamage,
          armorDefense: item.armorDefense,
        }
      : null,
  );
  const { status, label, run, dirty, markDirty } = useSaveStatus();
  const saving = status === SaveStatus.Saving;

  if (!item || !v) return <p className="t-metadata">Item not found.</p>;

  const update = (patch: Partial<typeof v>): void => {
    setV({ ...v, ...patch });
    markDirty();
  };

  const authoredTags = [...tree.tagLore.map((t) => t.tag)].sort((a, b) => a.localeCompare(b));

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
            priceTag: v.priceTag,
            weaponDamage: v.weaponDamage,
            armorDefense: v.armorDefense,
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
              onChange={(e) => update({ label: e.target.value })}
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
                  onChange={() => update({ ownerKind: OwnerKind.Location, ownerId: '' })}
                />
                Location
              </label>
              <label className="row-editor__checkbox">
                <input
                  type="radio"
                  name="owner-kind"
                  checked={v.ownerKind === OwnerKind.Agent}
                  onChange={() => update({ ownerKind: OwnerKind.Agent, ownerId: '' })}
                />
                Agent
              </label>
              <label className="row-editor__checkbox">
                <input
                  type="radio"
                  name="owner-kind"
                  checked={v.ownerKind === OwnerKind.Item}
                  onChange={() => update({ ownerKind: OwnerKind.Item, ownerId: '' })}
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
                onChange={(e) => update({ ownerId: e.target.value })}
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
                onChange={(e) => update({ weight: Number(e.target.value) })}
              />
            </div>
            <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
              <input
                type="checkbox"
                checked={v.hidden}
                onChange={(e) => update({ hidden: e.target.checked })}
              />
              Hidden
            </label>
            <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
              <input
                type="checkbox"
                checked={v.container}
                onChange={(e) =>
                  update({
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
            <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
              <input
                type="checkbox"
                checked={v.priceTag !== null}
                onChange={(e) =>
                  update({
                    priceTag: e.target.checked
                      ? typeof v.priceTag === 'number' && v.priceTag > 0
                        ? v.priceTag
                        : 1
                      : null,
                  })
                }
              />
              For sale
            </label>
            {v.priceTag !== null ? (
              <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
                <label className="row-editor__field-label" htmlFor="it-price">
                  Price (gold)
                </label>
                <input
                  id="it-price"
                  type="number"
                  min={1}
                  className="row-editor__input"
                  value={v.priceTag}
                  onChange={(e) =>
                    update({ priceTag: Math.max(1, Math.trunc(Number(e.target.value))) })
                  }
                />
              </div>
            ) : null}
            <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
              <input
                type="checkbox"
                checked={v.weaponDamage !== null}
                onChange={(e) =>
                  update({
                    weaponDamage: e.target.checked
                      ? typeof v.weaponDamage === 'number' && v.weaponDamage > 0
                        ? v.weaponDamage
                        : 4
                      : null,
                  })
                }
              />
              Is weapon
            </label>
            {v.weaponDamage !== null ? (
              <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
                <label className="row-editor__field-label" htmlFor="it-weapon-damage">
                  Damage die
                </label>
                <input
                  id="it-weapon-damage"
                  type="number"
                  min={1}
                  className="row-editor__input"
                  value={v.weaponDamage}
                  onChange={(e) =>
                    update({ weaponDamage: Math.max(1, Math.trunc(Number(e.target.value))) })
                  }
                />
              </div>
            ) : null}
            <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
              <input
                type="checkbox"
                checked={v.armorDefense !== null}
                onChange={(e) =>
                  update({
                    armorDefense: e.target.checked
                      ? typeof v.armorDefense === 'number' && v.armorDefense > 0
                        ? v.armorDefense
                        : 2
                      : null,
                  })
                }
              />
              Is armour
            </label>
            {v.armorDefense !== null ? (
              <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
                <label className="row-editor__field-label" htmlFor="it-armor-defense">
                  Defense bonus
                </label>
                <input
                  id="it-armor-defense"
                  type="number"
                  min={1}
                  className="row-editor__input"
                  value={v.armorDefense}
                  onChange={(e) =>
                    update({ armorDefense: Math.max(1, Math.trunc(Number(e.target.value))) })
                  }
                />
              </div>
            ) : null}
            {v.container ? (
              <>
                <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
                  <input
                    type="checkbox"
                    checked={v.opened}
                    onChange={(e) => update({ opened: e.target.checked })}
                  />
                  Starts opened
                </label>
                <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
                  <input
                    type="checkbox"
                    checked={v.locked}
                    onChange={(e) =>
                      update({
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
                        update({ lockedByItem: e.target.value === '' ? null : e.target.value })
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
              onChange={(next) => update({ tags: next })}
            />
          </div>
        </MetadataColumn>
      </form>
      <FootnoteBar
        dirty={dirty}
        onSave={save}
        saveLabel={label}
        saveDisabled={saving || v.ownerId === ''}
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
