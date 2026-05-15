import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { setAgentAutonomous } from '~/server/admin/worlds';
import { EntityHeader } from './EntityHeader';
import { FootnoteBar } from './FootnoteBar';
import { ManuscriptCard } from './ManuscriptCard';
import { MetadataColumn } from './MetadataColumn';
import { TagSelectorPanel } from './TagSelectorPanel';
import { SaveStatus, useSaveStatus } from './useSaveStatus';

export interface AgentFormProps {
  readonly tree: WorldTree;
  readonly agentId: string;
  readonly onSaved: () => Promise<void> | void;
  readonly onDeleted: () => void;
}

export function AgentForm({ tree, agentId, onSaved, onDeleted }: AgentFormProps) {
  const ag = tree.agents.find((a) => (a.id as string) === agentId);
  const [v, setV] = useState(
    ag
      ? {
          id: ag.id as string,
          label: ag.label,
          shortDescription: ag.shortDescription,
          longDescription: ag.longDescription,
          locationId: ag.locationId as string,
          hp: ag.hp,
          damage: ag.damage,
          defense: ag.defense,
          capacity: ag.capacity,
          mood: ag.mood ?? '',
          goal: ag.goal ?? '',
          autonomous: ag.autonomous,
          gold: ag.gold,
          tags: ag.tags,
          secretDescription: ag.secretDescription ?? '',
        }
      : null,
  );
  const { status, label, run, dirty, markDirty } = useSaveStatus();
  const saving = status === SaveStatus.Saving;

  if (!ag || !v) return <p className="t-metadata">Agent not found.</p>;

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
          entity: EntityKind.Agent,
          payload: {
            id: v.id,
            label: v.label,
            shortDescription: v.shortDescription,
            longDescription: v.longDescription,
            locationId: v.locationId,
            hp: v.hp,
            damage: v.damage,
            defense: v.defense,
            capacity: v.capacity,
            mood: v.mood === '' ? null : v.mood,
            goal: v.goal === '' ? null : v.goal,
            autonomous: v.autonomous,
            gold: v.gold,
            tags: v.tags,
            secretDescription: v.secretDescription,
          },
        },
      });
      await onSaved();
    });
  };

  return (
    <>
      <EntityHeader kindLabel="Agent" title={v.label || v.id} id={v.id} />
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="form-grid__primary">
          <div>
            <label htmlFor="ag-label" className="form-grid__field-label">
              Label
            </label>
            <input
              id="ag-label"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={v.label}
              onChange={(e) => update({ label: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="ag-loc" className="form-grid__field-label">
              Location
            </label>
            <select
              id="ag-loc"
              className="row-editor__select"
              value={v.locationId}
              onChange={(e) => update({ locationId: e.target.value })}
            >
              {tree.locations.map((l) => (
                <option key={l.id as string} value={l.id as string}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ag-short" className="form-grid__field-label">
              Short Description
            </label>
            <input
              id="ag-short"
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
            <span className="form-grid__field-label">Goal</span>
            <input
              type="text"
              className="manuscript-input-v2"
              value={v.goal}
              onChange={(e) => update({ goal: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="ag-secret" className="form-grid__field-label">
              GM-only Notes
            </label>
            <p className="t-metadata" style={{ margin: '0 0 var(--s-2) 0' }}>
              Visible only to the consequence engine — never to the player, the narrator, or NPCs.
              Use for hidden dynamics (secret allegiances, concealed goals, information the agent
              holds but hasn't revealed).
            </p>
            <textarea
              id="ag-secret"
              className="manuscript-input-v2"
              rows={4}
              placeholder="(secret)"
              value={v.secretDescription}
              onChange={(e) => update({ secretDescription: e.target.value })}
            />
          </div>
        </div>
        <MetadataColumn>
          <div className="row-editor__grid" style={{ gap: 'var(--s-4)' }}>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="ag-hp">
                HP
              </label>
              <input
                id="ag-hp"
                type="number"
                className="row-editor__input"
                value={v.hp}
                onChange={(e) => update({ hp: Number(e.target.value) })}
              />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="ag-cap">
                Capacity
              </label>
              <input
                id="ag-cap"
                type="number"
                className="row-editor__input"
                value={v.capacity}
                onChange={(e) => update({ capacity: Number(e.target.value) })}
              />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="ag-dmg">
                Damage
              </label>
              <input
                id="ag-dmg"
                type="number"
                className="row-editor__input"
                value={v.damage}
                onChange={(e) => update({ damage: Number(e.target.value) })}
              />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="ag-def">
                Defense
              </label>
              <input
                id="ag-def"
                type="number"
                className="row-editor__input"
                value={v.defense}
                onChange={(e) => update({ defense: Number(e.target.value) })}
              />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="ag-gold">
                Gold
              </label>
              <input
                id="ag-gold"
                type="number"
                min={0}
                className="row-editor__input"
                value={v.gold}
                onChange={(e) =>
                  update({ gold: Math.max(0, Math.trunc(Number(e.target.value))) })
                }
              />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
              <label className="row-editor__field-label" htmlFor="ag-mood">
                Mood
              </label>
              <input
                id="ag-mood"
                type="text"
                className="row-editor__input"
                value={v.mood}
                placeholder="(optional)"
                onChange={(e) => update({ mood: e.target.value })}
              />
            </div>
            <label
              className="row-editor__checkbox"
              style={{ gridColumn: 'span 12' }}
              title="Persists immediately — works on draft and live worlds (admin override)."
            >
              <input
                type="checkbox"
                checked={v.autonomous}
                onChange={async (e) => {
                  const next = e.target.checked;
                  setV({ ...v, autonomous: next });
                  const r = await setAgentAutonomous({
                    data: {
                      worldId: tree.summary.id as string,
                      agentId: v.id,
                      autonomous: next,
                    },
                  });
                  if (!r.ok) {
                    alert('Failed to update autonomy.');
                    setV({ ...v, autonomous: !next });
                    return;
                  }
                  onSaved();
                }}
              />
              Autonomous <span className="t-metadata">(persists on change)</span>
            </label>
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
        saveDisabled={saving}
        onDelete={async () => {
          await deleteEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Agent,
              id: v.id,
            },
          });
          onDeleted();
        }}
      />
    </>
  );
}
