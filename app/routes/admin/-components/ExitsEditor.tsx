import { EntityKind } from '@core/domain/builder-kinds';
import type { Exit, Item, Location } from '@core/domain/entities';
import { useMemo, useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { type ExitDraft, ExitRow, exitToDraft } from './ExitRow';

export interface ExitsEditorProps {
  readonly worldId: string;
  readonly sourceLocationId: string;
  readonly exits: readonly Exit[];
  readonly locations: readonly Location[];
  readonly items: readonly Item[];
  readonly onChanged: () => void;
}

function randomExitId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `exit_${rnd}`;
}

export function ExitsEditor({
  worldId,
  sourceLocationId,
  exits,
  locations,
  items,
  onChanged,
}: ExitsEditorProps) {
  const persisted = useMemo(() => exits.map(exitToDraft), [exits]);
  const [staged, setStaged] = useState<readonly ExitDraft[]>([]);

  const addNew = (): void => {
    setStaged((s) => [
      ...s,
      {
        id: randomExitId(),
        direction: '',
        label: '',
        toLocationId: '',
        locked: false,
        lockedByItemId: null,
        isNew: true,
      },
    ]);
  };

  const save = async (d: ExitDraft): Promise<void> => {
    await saveEntity({
      data: {
        worldId,
        entity: EntityKind.Exit,
        payload: {
          id: d.id,
          from: sourceLocationId,
          to: d.toLocationId,
          direction: d.direction,
          label: d.label,
          locked: d.locked,
          lockedByItem: d.lockedByItemId,
        },
      },
    });
    setStaged((s) => s.filter((r) => r.id !== d.id));
    onChanged();
  };

  const remove = async (id: string): Promise<void> => {
    await deleteEntity({
      data: { worldId, entity: EntityKind.Exit, id },
    });
    setStaged((s) => s.filter((r) => r.id !== id));
    onChanged();
  };

  const all: readonly ExitDraft[] = [...persisted, ...staged];

  return (
    <section className="sub-section">
      <header className="sub-section__heading">
        <h3 className="sub-section__title">Exits ({persisted.length})</h3>
        <button type="button" className="btn" onClick={addNew}>
          Add exit
        </button>
      </header>
      {all.length === 0 ? (
        <p className="t-metadata" style={{ fontStyle: 'italic' }}>
          No exits from this location.
        </p>
      ) : (
        all.map((d) => (
          <ExitRow
            key={d.id}
            draft={d}
            sourceLocationId={sourceLocationId}
            locations={locations}
            items={items}
            onSave={save}
            onDelete={remove}
          />
        ))
      )}
    </section>
  );
}
