import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';
import { useState } from 'react';
import { saveEntity } from '~/server/admin/entities';
import { upsertTemplate } from '~/server/admin/templates';
import { type Category, CategoryKind } from './category-helpers';

export interface CreateAffordanceProps {
  readonly tree: WorldTree;
  readonly category: Category;
  readonly onCreated: (id: string) => void;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function CreateAffordance({ tree, category, onCreated }: CreateAffordanceProps) {
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);

  return (
    <div className="create-affordance">
      {open ? (
        <CreateForm
          tree={tree}
          category={category}
          onCancel={close}
          onCreated={(id) => {
            setOpen(false);
            onCreated(id);
          }}
        />
      ) : (
        <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
          + New {singular(category)}
        </button>
      )}
    </div>
  );
}

function singular(c: Category): string {
  if (c === CategoryKind.Locations) return 'location';
  if (c === CategoryKind.Bestiary) return 'template';
  if (c === CategoryKind.Agents) return 'agent';
  return 'item';
}

interface CreateFormProps {
  readonly tree: WorldTree;
  readonly onCancel: () => void;
  readonly onCreated: (id: string) => void;
}

function CreateForm({
  tree,
  category,
  onCancel,
  onCreated,
}: CreateFormProps & { readonly category: Category }) {
  if (category === CategoryKind.Locations)
    return <CreateLocation tree={tree} onCancel={onCancel} onCreated={onCreated} />;
  if (category === CategoryKind.Bestiary)
    return <CreateTemplate tree={tree} onCancel={onCancel} onCreated={onCreated} />;
  if (category === CategoryKind.Agents)
    return <CreateAgent tree={tree} onCancel={onCancel} onCreated={onCreated} />;
  return <CreateItem tree={tree} onCancel={onCancel} onCreated={onCreated} />;
}

function CreateLocation({ tree, onCancel, onCreated }: CreateFormProps) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (): Promise<void> => {
    if (busy || label.trim() === '') return;
    setBusy(true);
    try {
      const id = randomId('loc');
      await saveEntity({
        data: {
          worldId: tree.summary.id as string,
          entity: EntityKind.Location,
          payload: { id, label: label.trim(), shortDescription: '', longDescription: '', tags: [] },
        },
      });
      onCreated(id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <InlineCreate onCancel={onCancel} onSubmit={submit} busy={busy} canSubmit={label.trim() !== ''}>
      <Field label="Label" htmlFor="new-loc-label">
        <input
          id="new-loc-label"
          type="text"
          className="row-editor__input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
    </InlineCreate>
  );
}

function CreateTemplate({ tree, onCancel, onCreated }: CreateFormProps) {
  const [label, setLabel] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (): Promise<void> => {
    if (busy || label.trim() === '' || templateKey.trim() === '') return;
    setBusy(true);
    try {
      const id = randomId('tpl');
      await upsertTemplate({
        data: {
          worldId: tree.summary.id as string,
          payload: {
            id,
            templateKey: templateKey.trim(),
            label: label.trim(),
            shortDescription: '',
            longDescription: '',
            hp: 1,
            mood: null,
            startingItems: [],
          },
        },
      });
      onCreated(id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <InlineCreate
      onCancel={onCancel}
      onSubmit={submit}
      busy={busy}
      canSubmit={label.trim() !== '' && templateKey.trim() !== ''}
    >
      <Field label="Label" htmlFor="new-tpl-label">
        <input
          id="new-tpl-label"
          type="text"
          className="row-editor__input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
      <Field label="Template key" htmlFor="new-tpl-key">
        <input
          id="new-tpl-key"
          type="text"
          className="row-editor__input"
          placeholder="e.g. goblin"
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value)}
        />
      </Field>
    </InlineCreate>
  );
}

function CreateAgent({ tree, onCancel, onCreated }: CreateFormProps) {
  const [label, setLabel] = useState('');
  const [locationId, setLocationId] = useState((tree.locations[0]?.id as string | undefined) ?? '');
  const [busy, setBusy] = useState(false);
  if (tree.locations.length === 0) {
    return (
      <p className="t-metadata" style={{ fontStyle: 'italic', padding: 'var(--s-3)' }}>
        Create a location first.
      </p>
    );
  }
  const submit = async (): Promise<void> => {
    if (busy || label.trim() === '' || locationId === '') return;
    setBusy(true);
    try {
      const id = randomId('agent');
      await saveEntity({
        data: {
          worldId: tree.summary.id as string,
          entity: EntityKind.Agent,
          payload: {
            id,
            label: label.trim(),
            shortDescription: '',
            longDescription: '',
            locationId,
            hp: 10,
            damage: 1,
            defense: 0,
            capacity: 10,
            mood: null,
            goal: null,
            autonomous: false,
          },
        },
      });
      onCreated(id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <InlineCreate
      onCancel={onCancel}
      onSubmit={submit}
      busy={busy}
      canSubmit={label.trim() !== '' && locationId !== ''}
    >
      <Field label="Label" htmlFor="new-ag-label">
        <input
          id="new-ag-label"
          type="text"
          className="row-editor__input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
      <Field label="Location" htmlFor="new-ag-loc">
        <select
          id="new-ag-loc"
          className="row-editor__select"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          {tree.locations.map((l) => (
            <option key={l.id as string} value={l.id as string}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>
    </InlineCreate>
  );
}

function CreateItem({ tree, onCancel, onCreated }: CreateFormProps) {
  const [label, setLabel] = useState('');
  const [ownerKind, setOwnerKind] = useState<typeof OwnerKind.Location | typeof OwnerKind.Agent>(
    OwnerKind.Location,
  );
  const [ownerId, setOwnerId] = useState((tree.locations[0]?.id as string | undefined) ?? '');
  const [busy, setBusy] = useState(false);
  if (tree.locations.length === 0 && tree.agents.length === 0) {
    return (
      <p className="t-metadata" style={{ fontStyle: 'italic', padding: 'var(--s-3)' }}>
        Create a location or agent first.
      </p>
    );
  }
  const ownerOptions = ownerKind === OwnerKind.Location ? tree.locations : tree.agents;
  const submit = async (): Promise<void> => {
    if (busy || label.trim() === '' || ownerId === '') return;
    setBusy(true);
    try {
      const id = randomId('item');
      await saveEntity({
        data: {
          worldId: tree.summary.id as string,
          entity: EntityKind.Item,
          payload: {
            id,
            label: label.trim(),
            shortDescription: '',
            longDescription: '',
            ownerKind,
            ownerId,
            weight: 1,
            hidden: false,
          },
        },
      });
      onCreated(id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <InlineCreate
      onCancel={onCancel}
      onSubmit={submit}
      busy={busy}
      canSubmit={label.trim() !== '' && ownerId !== ''}
    >
      <Field label="Label" htmlFor="new-it-label">
        <input
          id="new-it-label"
          type="text"
          className="row-editor__input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
      <Field label="Owner kind" htmlFor="">
        <div style={{ display: 'flex', gap: 12 }}>
          <label className="row-editor__checkbox">
            <input
              type="radio"
              name="new-item-owner"
              checked={ownerKind === OwnerKind.Location}
              onChange={() => {
                setOwnerKind(OwnerKind.Location);
                setOwnerId((tree.locations[0]?.id as string | undefined) ?? '');
              }}
            />
            Location
          </label>
          <label className="row-editor__checkbox">
            <input
              type="radio"
              name="new-item-owner"
              checked={ownerKind === OwnerKind.Agent}
              onChange={() => {
                setOwnerKind(OwnerKind.Agent);
                setOwnerId((tree.agents[0]?.id as string | undefined) ?? '');
              }}
            />
            Agent
          </label>
        </div>
      </Field>
      <Field label="Owner" htmlFor="new-it-owner">
        <select
          id="new-it-owner"
          className="row-editor__select"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
        >
          {ownerOptions.map((o) => (
            <option key={o.id as string} value={o.id as string}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </InlineCreate>
  );
}

interface InlineCreateProps {
  readonly onCancel: () => void;
  readonly onSubmit: () => Promise<void>;
  readonly busy: boolean;
  readonly canSubmit: boolean;
  readonly children: React.ReactNode;
}

function InlineCreate({ onCancel, onSubmit, busy, canSubmit, children }: InlineCreateProps) {
  return (
    <div className="row-editor" style={{ margin: 0 }}>
      {children}
      <div className="row-editor__actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onSubmit}
          disabled={busy || !canSubmit}
        >
          Create
        </button>
      </div>
    </div>
  );
}

interface FieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly children: React.ReactNode;
}

function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <div className="row-editor__field">
      {htmlFor === '' ? (
        <span className="row-editor__field-label">{label}</span>
      ) : (
        <label className="row-editor__field-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}
