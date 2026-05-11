import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { LocationSpawnTrigger, MonsterTemplate } from '@core/domain/builder-types';
import { useState } from 'react';

type EventKindValue = (typeof TriggerEventKind)[keyof typeof TriggerEventKind];

export interface TriggerDraft {
  readonly id: string;
  readonly eventKind: EventKindValue;
  readonly templateId: string;
  readonly count: number;
  readonly oneShot: boolean;
  readonly fireOnInitialPublish: boolean;
  readonly itemTemplateKey: string;
  readonly phrase: string;
  readonly predicate: string;
  readonly isNew: boolean;
}

export function triggerToDraft(t: LocationSpawnTrigger): TriggerDraft {
  return {
    id: t.id as string,
    eventKind: t.params.kind,
    templateId: t.templateId as string,
    count: t.count,
    oneShot: t.oneShot,
    fireOnInitialPublish: t.fireOnInitialPublish,
    itemTemplateKey:
      t.params.kind === TriggerEventKind.ItemTaken ? (t.params.itemTemplateKey ?? '') : '',
    phrase: t.params.kind === TriggerEventKind.Speech ? t.params.phrase : '',
    predicate: t.params.kind === TriggerEventKind.LlmJudgement ? t.params.predicate : '',
    isNew: false,
  };
}

const EVENT_OPTIONS: ReadonlyArray<{ readonly value: EventKindValue; readonly label: string }> = [
  { value: TriggerEventKind.PlayerEnters, label: 'Player enters' },
  { value: TriggerEventKind.CombatStarts, label: 'Combat starts' },
  { value: TriggerEventKind.ItemTaken, label: 'Item taken' },
  { value: TriggerEventKind.Speech, label: 'Speech' },
  { value: TriggerEventKind.LlmJudgement, label: 'LLM judgement' },
];

export interface TriggerRowProps {
  readonly draft: TriggerDraft;
  readonly templates: readonly MonsterTemplate[];
  readonly onSave: (draft: TriggerDraft) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
}

export function TriggerRow({ draft: initial, templates, onSave, onDelete }: TriggerRowProps) {
  const [v, setV] = useState<TriggerDraft>(initial);
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    if (busy) return;
    if (v.templateId === '' || v.count < 1) return;
    setBusy(true);
    try {
      await onSave({ ...v, isNew: false });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete(v.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row-editor">
      <div className="row-editor__grid">
        <div className="row-editor__field" style={{ gridColumn: 'span 4' }}>
          <label className="row-editor__field-label" htmlFor={`tev-${v.id}`}>
            Event
          </label>
          <select
            id={`tev-${v.id}`}
            className="row-editor__select"
            value={v.eventKind}
            onChange={(e) => setV({ ...v, eventKind: e.target.value as EventKindValue })}
          >
            {EVENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 4' }}>
          <label className="row-editor__field-label" htmlFor={`ttpl-${v.id}`}>
            Template
          </label>
          <select
            id={`ttpl-${v.id}`}
            className="row-editor__select"
            value={v.templateId}
            onChange={(e) => setV({ ...v, templateId: e.target.value })}
          >
            <option value="">— pick a template —</option>
            {templates.map((t) => (
              <option key={t.id as string} value={t.id as string}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 2' }}>
          <label className="row-editor__field-label" htmlFor={`tcount-${v.id}`}>
            Count
          </label>
          <input
            id={`tcount-${v.id}`}
            type="number"
            min={1}
            className="row-editor__input"
            value={v.count}
            onChange={(e) => setV({ ...v, count: Number(e.target.value) })}
          />
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 2' }}>
          <label className="row-editor__checkbox">
            <input
              type="checkbox"
              checked={v.oneShot}
              onChange={(e) => setV({ ...v, oneShot: e.target.checked })}
            />
            One-shot
          </label>
          <label className="row-editor__checkbox">
            <input
              type="checkbox"
              checked={v.fireOnInitialPublish}
              onChange={(e) => setV({ ...v, fireOnInitialPublish: e.target.checked })}
            />
            Fire on publish
          </label>
        </div>
        {v.eventKind === TriggerEventKind.ItemTaken ? (
          <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
            <label className="row-editor__field-label" htmlFor={`titk-${v.id}`}>
              Item template key (optional)
            </label>
            <input
              id={`titk-${v.id}`}
              type="text"
              className="row-editor__input"
              value={v.itemTemplateKey}
              onChange={(e) => setV({ ...v, itemTemplateKey: e.target.value })}
            />
          </div>
        ) : null}
        {v.eventKind === TriggerEventKind.Speech ? (
          <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
            <label className="row-editor__field-label" htmlFor={`tphr-${v.id}`}>
              Phrase
            </label>
            <input
              id={`tphr-${v.id}`}
              type="text"
              className="row-editor__input"
              value={v.phrase}
              onChange={(e) => setV({ ...v, phrase: e.target.value })}
            />
          </div>
        ) : null}
        {v.eventKind === TriggerEventKind.LlmJudgement ? (
          <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
            <label className="row-editor__field-label" htmlFor={`tpred-${v.id}`}>
              Predicate
            </label>
            <input
              id={`tpred-${v.id}`}
              type="text"
              className="row-editor__input"
              value={v.predicate}
              onChange={(e) => setV({ ...v, predicate: e.target.value })}
            />
          </div>
        ) : null}
      </div>
      <div className="row-editor__actions">
        {v.isNew ? null : (
          <button type="button" className="btn" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
          {v.isNew ? 'Create' : 'Save'}
        </button>
      </div>
    </div>
  );
}
