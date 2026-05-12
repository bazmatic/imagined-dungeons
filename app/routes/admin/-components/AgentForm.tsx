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

export interface AgentFormProps {
  readonly tree: WorldTree;
  readonly agentId: string;
  readonly problemCount: number;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
}

export function AgentForm({ tree, agentId, problemCount, onSaved, onDeleted }: AgentFormProps) {
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
          tags: ag.tags,
        }
      : null,
  );
  const [saving, setSaving] = useState(false);

  if (!ag || !v) return <p className="t-metadata">Agent not found.</p>;

  const authoredTags = [...tree.tagLore.map((t) => t.tag)].sort((a, b) => a.localeCompare(b));

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
            tags: v.tags,
          },
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <EntityHeader kindLabel="Agent" title={v.label || v.id} id={v.id} />
      <div className="form-grid">
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
              onChange={(e) => setV({ ...v, label: e.target.value })}
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
              onChange={(e) => setV({ ...v, locationId: e.target.value })}
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
          <div>
            <span className="form-grid__field-label">Goal</span>
            <input
              type="text"
              className="manuscript-input-v2"
              value={v.goal}
              onChange={(e) => setV({ ...v, goal: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              Save
            </button>
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
                onChange={(e) => setV({ ...v, hp: Number(e.target.value) })}
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
                onChange={(e) => setV({ ...v, capacity: Number(e.target.value) })}
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
                onChange={(e) => setV({ ...v, damage: Number(e.target.value) })}
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
                onChange={(e) => setV({ ...v, defense: Number(e.target.value) })}
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
                onChange={(e) => setV({ ...v, mood: e.target.value })}
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
              onChange={(next) => setV({ ...v, tags: next })}
            />
          </div>
        </MetadataColumn>
      </div>
      <FootnoteBar
        wordCount={wordCount}
        charCount={charCount}
        problemCount={problemCount}
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
