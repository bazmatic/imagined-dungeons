import { EntityKind, WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { publish, resetLive } from '~/server/admin/publish';
import { validate } from '~/server/admin/validate';
import { getWorld } from '~/server/admin/worlds';

export const Route = createFileRoute('/admin/$worldId')({
  component: AdminWorld,
  loader: async ({ params }) => {
    const tree = await getWorld({ data: { id: params.worldId } });
    const v = await validate({ data: { id: params.worldId } });
    return { tree, problems: v.ok ? v.value : [] };
  },
});

type Selected =
  | { kind: 'world' }
  | { kind: (typeof EntityKind)[keyof typeof EntityKind]; id: string };

function AdminWorld() {
  const { tree, problems } = Route.useLoaderData();
  const router = useRouter();
  const [sel, setSel] = useState<Selected>({ kind: 'world' });

  const problemsByEntity = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) {
      const k = `${p.entity}:${p.entityId}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [problems]);

  if (!tree.ok) {
    return <div style={{ padding: 24 }}>World not found.</div>;
  }
  const t = tree.value;

  const dot = (entity: string, id: string) =>
    problemsByEntity.has(`${entity}:${id}`) ? (
      <span style={{ color: '#e57373', marginLeft: 6 }}>●</span>
    ) : null;

  const refresh = () => router.invalidate();

  const onPublish = async () => {
    const r = await publish({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Publish failed: ${r.error.message}`);
    else alert(`Published. Skipped: ${r.value.skipped.length}`);
  };
  const onReset = async () => {
    if (
      !confirm(
        'Reset live world to this draft? This will replace structural rows on the live world.',
      )
    )
      return;
    const r = await resetLive({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Reset failed: ${r.error.message}`);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: '100vh' }}>
      <aside style={{ borderRight: '1px solid #222', padding: 16, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>
          {t.summary.displayName || t.summary.label}{' '}
          <small style={{ opacity: 0.6 }}>({t.summary.kind})</small>
        </h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {t.summary.kind === WorldKind.Draft && (
            <>
              <button type="button" onClick={onPublish}>
                Publish
              </button>
              <button type="button" onClick={onReset}>
                Reset live
              </button>
            </>
          )}
        </div>
        <button type="button" onClick={() => setSel({ kind: 'world' })}>
          World settings
        </button>

        <h3 style={{ fontSize: 12, marginTop: 16 }}>Locations</h3>
        <ul>
          {t.locations.map((l) => {
            const locId = l.id as string;
            const exitsHere = t.exits.filter((e) => (e.from as string) === locId);
            const agentsHere = t.agents.filter((a) => (a.locationId as string) === locId);
            const itemsHere = t.items.filter(
              (i) => i.owner.kind === OwnerKind.Location && (i.owner.id as string) === locId,
            );
            return (
              <li key={locId} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  onClick={() => setSel({ kind: EntityKind.Location, id: locId })}
                >
                  {l.label}
                </button>
                {dot(EntityKind.Location, locId)}
                {(exitsHere.length > 0 || agentsHere.length > 0 || itemsHere.length > 0) && (
                  <ul style={{ marginLeft: 16, marginTop: 2 }}>
                    {exitsHere.map((e) => (
                      <li key={e.id as string}>
                        <button
                          type="button"
                          onClick={() => setSel({ kind: EntityKind.Exit, id: e.id as string })}
                          style={{ opacity: 0.85 }}
                        >
                          ↪ {e.direction} → {e.to}
                        </button>
                        {dot(EntityKind.Exit, e.id as string)}
                      </li>
                    ))}
                    {agentsHere.map((a) => (
                      <li key={a.id as string}>
                        <button
                          type="button"
                          onClick={() => setSel({ kind: EntityKind.Agent, id: a.id as string })}
                          style={{ opacity: 0.85 }}
                        >
                          ☻ {a.label}
                        </button>
                        {dot(EntityKind.Agent, a.id as string)}
                      </li>
                    ))}
                    {itemsHere.map((i) => (
                      <li key={i.id as string}>
                        <button
                          type="button"
                          onClick={() => setSel({ kind: EntityKind.Item, id: i.id as string })}
                          style={{ opacity: 0.85 }}
                        >
                          ◆ {i.label}
                        </button>
                        {dot(EntityKind.Item, i.id as string)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        {(() => {
          const orphanItems = t.items.filter((i) => i.owner.kind !== OwnerKind.Location);
          if (orphanItems.length === 0) return null;
          return (
            <>
              <h3 style={{ fontSize: 12, marginTop: 16 }}>Items (carried / nested)</h3>
              <ul>
                {orphanItems.map((i) => (
                  <li key={i.id as string}>
                    <button
                      type="button"
                      onClick={() => setSel({ kind: EntityKind.Item, id: i.id as string })}
                    >
                      ◆ {i.label}
                    </button>
                    {dot(EntityKind.Item, i.id as string)}
                  </li>
                ))}
              </ul>
            </>
          );
        })()}
      </aside>

      <main style={{ padding: 24, overflowY: 'auto' }}>
        <FormPanel
          tree={t}
          sel={sel}
          onSaved={refresh}
          onDeleted={() => {
            setSel({ kind: 'world' });
            refresh();
          }}
        />
        <h3 style={{ marginTop: 32, fontSize: 12 }}>Problems ({problems.length})</h3>
        <ul>
          {problems.map((p) => (
            <li key={`${p.entity}:${p.entityId}:${p.kind}`}>{p.message}</li>
          ))}
        </ul>
      </main>
    </div>
  );
}

type TreeValue = WorldTree;

function FormPanel(props: {
  tree: TreeValue;
  sel: Selected;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, sel, onSaved, onDeleted } = props;
  if (sel.kind === 'world') {
    return <p>Select an entity from the tree.</p>;
  }
  if (sel.kind === EntityKind.Location) {
    const loc = tree.locations.find((l) => (l.id as string) === sel.id);
    if (!loc) return <p>Not found.</p>;
    return (
      <SimpleForm
        title={`Location: ${loc.label}`}
        initial={{
          id: loc.id as string,
          label: loc.label,
          shortDescription: loc.shortDescription,
          longDescription: loc.longDescription,
        }}
        fields={[
          { key: 'id', label: 'ID', readOnly: true },
          { key: 'label', label: 'Label' },
          { key: 'shortDescription', label: 'Short description' },
          { key: 'longDescription', label: 'Long description', long: true },
        ]}
        onSave={async (v) => {
          await saveEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Location,
              payload: v,
            },
          });
          onSaved();
        }}
        onDelete={async () => {
          await deleteEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Location,
              id: loc.id as string,
            },
          });
          onDeleted();
        }}
      />
    );
  }
  // Agent / Item / Exit follow the same shape; abbreviated to JSON edit for v1.
  return <RawJsonForm tree={tree} sel={sel} onSaved={onSaved} onDeleted={onDeleted} />;
}

interface FieldDef {
  key: string;
  label: string;
  readOnly?: boolean;
  long?: boolean;
}
function SimpleForm(props: {
  title: string;
  initial: Record<string, string>;
  fields: readonly FieldDef[];
  onSave: (v: Record<string, string>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { title, initial, fields, onSave, onDelete } = props;
  const [v, setV] = useState(initial);
  return (
    <div>
      <h2 style={{ fontSize: 14, marginBottom: 12 }}>{title}</h2>
      {fields.map((f) =>
        f.long ? (
          <div key={f.key} style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 11 }}>
              {f.label}
              <textarea
                value={v[f.key] ?? ''}
                readOnly={f.readOnly}
                rows={4}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                style={{
                  width: '100%',
                  background: '#111',
                  color: '#cfcfcf',
                  border: '1px solid #333',
                }}
              />
            </label>
          </div>
        ) : (
          <div key={f.key} style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 11 }}>
              {f.label}
              <input
                value={v[f.key] ?? ''}
                readOnly={f.readOnly}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                style={{
                  width: '100%',
                  background: '#111',
                  color: '#cfcfcf',
                  border: '1px solid #333',
                  padding: 4,
                }}
              />
            </label>
          </div>
        ),
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onSave(v)}>
          Save
        </button>
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function RawJsonForm(props: {
  tree: TreeValue;
  sel: Exclude<Selected, { kind: 'world' }>;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, sel, onSaved, onDeleted } = props;
  const find = () => {
    if (sel.kind === EntityKind.Agent) return tree.agents.find((a) => (a.id as string) === sel.id);
    if (sel.kind === EntityKind.Item) return tree.items.find((i) => (i.id as string) === sel.id);
    return tree.exits.find((e) => (e.id as string) === sel.id);
  };
  const initial = find();
  const [json, setJson] = useState(JSON.stringify(initial ?? {}, null, 2));
  if (!initial) return <p>Not found.</p>;
  return (
    <div>
      <h2 style={{ fontSize: 14, marginBottom: 12 }}>
        {sel.kind}: {sel.id}
      </h2>
      <p style={{ opacity: 0.6, fontSize: 11 }}>
        v1 fallback editor — edit fields as JSON, then Save.
      </p>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={20}
        style={{ width: '100%', background: '#111', color: '#cfcfcf', border: '1px solid #333' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={async () => {
            // biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns any; we validate in try/catch
            let parsed: any;
            try {
              parsed = JSON.parse(json);
            } catch (e) {
              alert(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
              return;
            }
            // Items use `owner: { kind, id }` in the entity; the upsert input takes
            // `ownerKind` + `ownerId`. Translate here.
            const payload =
              sel.kind === EntityKind.Item
                ? {
                    ...parsed,
                    ownerKind: parsed.owner?.kind,
                    ownerId: parsed.owner?.id,
                  }
                : parsed;
            await saveEntity({
              data: { worldId: tree.summary.id as string, entity: sel.kind, payload },
            });
            onSaved();
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={async () => {
            await deleteEntity({
              data: { worldId: tree.summary.id as string, entity: sel.kind, id: sel.id },
            });
            onDeleted();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
