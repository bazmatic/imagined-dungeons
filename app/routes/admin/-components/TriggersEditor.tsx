import { TriggerEventKind } from '@core/domain/builder-kinds';
import type {
  LocationSpawnTrigger,
  MonsterTemplate,
  TriggerParams,
} from '@core/domain/builder-types';
import { useMemo, useState } from 'react';
import { deleteTrigger, upsertTrigger } from '~/server/admin/templates';
import { type TriggerDraft, TriggerRow, triggerToDraft } from './TriggerRow';

export interface TriggersEditorProps {
  readonly worldId: string;
  readonly sourceLocationId: string;
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly templates: readonly MonsterTemplate[];
  readonly onChanged: () => void;
}

function randomTriggerId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `trg_${rnd}`;
}

function draftToParams(d: TriggerDraft): TriggerParams {
  switch (d.eventKind) {
    case TriggerEventKind.PlayerEnters:
      return { kind: TriggerEventKind.PlayerEnters };
    case TriggerEventKind.CombatStarts:
      return { kind: TriggerEventKind.CombatStarts };
    case TriggerEventKind.ItemTaken:
      return d.itemTemplateKey === ''
        ? { kind: TriggerEventKind.ItemTaken }
        : { kind: TriggerEventKind.ItemTaken, itemTemplateKey: d.itemTemplateKey };
    case TriggerEventKind.Speech:
      return { kind: TriggerEventKind.Speech, phrase: d.phrase };
    case TriggerEventKind.LlmJudgement:
      return { kind: TriggerEventKind.LlmJudgement, predicate: d.predicate };
  }
}

export function TriggersEditor({
  worldId,
  sourceLocationId,
  triggers,
  templates,
  onChanged,
}: TriggersEditorProps) {
  const persisted = useMemo(() => triggers.map(triggerToDraft), [triggers]);
  const [staged, setStaged] = useState<readonly TriggerDraft[]>([]);

  const addNew = (): void => {
    setStaged((s) => [
      ...s,
      {
        id: randomTriggerId(),
        eventKind: TriggerEventKind.PlayerEnters,
        templateId: '',
        count: 1,
        oneShot: true,
        fireOnInitialPublish: false,
        itemTemplateKey: '',
        phrase: '',
        predicate: '',
        isNew: true,
      },
    ]);
  };

  const save = async (d: TriggerDraft): Promise<void> => {
    await upsertTrigger({
      data: {
        worldId,
        payload: {
          id: d.id,
          locationId: sourceLocationId,
          templateId: d.templateId,
          params: draftToParams(d),
          count: d.count,
          oneShot: d.oneShot,
          fireOnInitialPublish: d.fireOnInitialPublish,
        },
      },
    });
    setStaged((s) => s.filter((r) => r.id !== d.id));
    onChanged();
  };

  const remove = async (id: string): Promise<void> => {
    await deleteTrigger({ data: { worldId, id } });
    setStaged((s) => s.filter((r) => r.id !== id));
    onChanged();
  };

  const all: readonly TriggerDraft[] = [...persisted, ...staged];

  return (
    <section className="sub-section">
      <header className="sub-section__heading">
        <h3 className="sub-section__title">Triggers ({persisted.length})</h3>
        <button type="button" className="btn" onClick={addNew}>
          Add trigger
        </button>
      </header>
      {all.length === 0 ? (
        <p className="t-metadata" style={{ fontStyle: 'italic' }}>
          No triggers on this location.
        </p>
      ) : (
        all.map((d) => (
          <TriggerRow key={d.id} draft={d} templates={templates} onSave={save} onDelete={remove} />
        ))
      )}
    </section>
  );
}
