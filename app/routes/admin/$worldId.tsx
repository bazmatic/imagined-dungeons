import { EntityKind, WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { publish, resetLive } from '~/server/admin/publish';
import {
  deleteTemplate,
  deleteTrigger,
  upsertTemplate,
  upsertTrigger,
} from '~/server/admin/templates';
import { validate } from '~/server/admin/validate';
import { getWorld } from '~/server/admin/worlds';
import { Breadcrumbs } from './-components/Breadcrumbs';
import { CommandPalette } from './-components/CommandPalette';
import { Fonts } from './-components/Fonts';
import { ManuscriptCard } from './-components/ManuscriptCard';
import { ProblemsRail } from './-components/ProblemsRail';
import { StatusBadge } from './-components/StatusBadge';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export const Route = createFileRoute('/admin/$worldId')({
  component: AdminWorld,
  loader: async ({ params }) => {
    const tree = await getWorld({ data: { id: params.worldId } });
    const v = await validate({ data: { id: params.worldId } });
    return { tree, problems: v.ok ? v.value : [] };
  },
});

type Selected = { kind: 'world' } | { kind: EntityKindValue; id: string };

function AdminWorld() {
  const { tree, problems } = Route.useLoaderData();
  const router = useRouter();
  const [sel, setSel] = useState<Selected>({ kind: 'world' });
  const [paletteOpen, setPaletteOpen] = useState(false);

  const problemsByEntity = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) {
      const k = `${p.entity}:${p.entityId}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [problems]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!tree.ok) {
    return (
      <div className="admin-root" style={{ padding: 24 }}>
        World not found.
      </div>
    );
  }
  const t = tree.value;

  const dot = (entity: string, id: string) =>
    problemsByEntity.has(`${entity}:${id}`) ? <span className="tree-item__dot">●</span> : null;

  const refresh = () => router.invalidate();

  const onPublish = async (): Promise<void> => {
    const r = await publish({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Publish failed: ${r.error.message}`);
    else alert(`Published. Skipped: ${r.value.skipped.length}`);
  };
  const onReset = async (): Promise<void> => {
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

  const isSelected = (kind: EntityKindValue, id: string): boolean =>
    sel.kind === kind && 'id' in sel && sel.id === id;

  return (
    <div className="admin-root">
      <Fonts />
      <div className="detail-shell">
        <header className="detail-header">
          <h1 className="t-headline-md">{t.summary.displayName || t.summary.label}</h1>
          <StatusBadge kind={t.summary.kind} id={t.summary.id as string} />
          <div className="detail-header__actions">
            {t.summary.kind === WorldKind.Draft && (
              <>
                <button type="button" className="btn btn--primary" onClick={onPublish}>
                  Publish
                </button>
                <button type="button" className="btn" onClick={onReset}>
                  Reset live
                </button>
              </>
            )}
          </div>
        </header>

        <aside className="tree-pane">
          <button
            type="button"
            className={`tree-item__button ${
              sel.kind === 'world' ? 'tree-item__button--selected' : ''
            }`}
            onClick={() => setSel({ kind: 'world' })}
          >
            World settings
          </button>

          <div className="tree-section">
            <h3 className="t-label-caps tree-section__heading">Locations</h3>
            <ul className="tree-list">
              {t.locations.map((l) => {
                const locId = l.id as string;
                const exitsHere = t.exits.filter((e) => (e.from as string) === locId);
                const agentsHere = t.agents.filter((a) => (a.locationId as string) === locId);
                const itemsHere = t.items.filter(
                  (i) => i.owner.kind === OwnerKind.Location && (i.owner.id as string) === locId,
                );
                const triggersHere = t.triggers.filter(
                  (trg) => (trg.locationId as string) === locId,
                );
                return (
                  <li key={locId} className="tree-item">
                    <button
                      type="button"
                      className={`tree-item__button ${
                        isSelected(EntityKind.Location, locId) ? 'tree-item__button--selected' : ''
                      }`}
                      onClick={() => setSel({ kind: EntityKind.Location, id: locId })}
                    >
                      {l.label}
                      {dot(EntityKind.Location, locId)}
                    </button>
                    {(exitsHere.length > 0 ||
                      agentsHere.length > 0 ||
                      itemsHere.length > 0 ||
                      triggersHere.length > 0) && (
                      <ul className="tree-list">
                        {exitsHere.map((e) => {
                          const id = e.id as string;
                          return (
                            <li key={id} className="tree-item">
                              <button
                                type="button"
                                className={`tree-item__button tree-item__button--dim ${
                                  isSelected(EntityKind.Exit, id)
                                    ? 'tree-item__button--selected'
                                    : ''
                                }`}
                                onClick={() => setSel({ kind: EntityKind.Exit, id })}
                              >
                                ↪ {e.direction} → {e.to}
                                {dot(EntityKind.Exit, id)}
                              </button>
                            </li>
                          );
                        })}
                        {agentsHere.map((a) => {
                          const id = a.id as string;
                          return (
                            <li key={id} className="tree-item">
                              <button
                                type="button"
                                className={`tree-item__button tree-item__button--dim ${
                                  isSelected(EntityKind.Agent, id)
                                    ? 'tree-item__button--selected'
                                    : ''
                                }`}
                                onClick={() => setSel({ kind: EntityKind.Agent, id })}
                              >
                                ☻ {a.label}
                                {dot(EntityKind.Agent, id)}
                              </button>
                            </li>
                          );
                        })}
                        {itemsHere.map((i) => {
                          const id = i.id as string;
                          return (
                            <li key={id} className="tree-item">
                              <button
                                type="button"
                                className={`tree-item__button tree-item__button--dim ${
                                  isSelected(EntityKind.Item, id)
                                    ? 'tree-item__button--selected'
                                    : ''
                                }`}
                                onClick={() => setSel({ kind: EntityKind.Item, id })}
                              >
                                ◆ {i.label}
                                {dot(EntityKind.Item, id)}
                              </button>
                            </li>
                          );
                        })}
                        {triggersHere.map((trg) => {
                          const id = trg.id as string;
                          return (
                            <li key={id} className="tree-item">
                              <button
                                type="button"
                                className={`tree-item__button tree-item__button--dim ${
                                  isSelected(EntityKind.LocationSpawnTrigger, id)
                                    ? 'tree-item__button--selected'
                                    : ''
                                }`}
                                onClick={() =>
                                  setSel({ kind: EntityKind.LocationSpawnTrigger, id })
                                }
                              >
                                ⚡ {trg.params.kind} → {trg.templateId} (×{trg.count})
                                {dot(EntityKind.LocationSpawnTrigger, id)}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="tree-section">
            <h3 className="t-label-caps tree-section__heading">Bestiary</h3>
            <ul className="tree-list">
              {t.templates.map((tpl) => {
                const id = tpl.id as string;
                return (
                  <li key={id} className="tree-item">
                    <button
                      type="button"
                      className={`tree-item__button ${
                        isSelected(EntityKind.MonsterTemplate, id)
                          ? 'tree-item__button--selected'
                          : ''
                      }`}
                      onClick={() => setSel({ kind: EntityKind.MonsterTemplate, id })}
                    >
                      🐲 {tpl.label}
                      {dot(EntityKind.MonsterTemplate, id)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {(() => {
            const orphanItems = t.items.filter((i) => i.owner.kind !== OwnerKind.Location);
            if (orphanItems.length === 0) return null;
            return (
              <div className="tree-section">
                <h3 className="t-label-caps tree-section__heading">Items (carried / nested)</h3>
                <ul className="tree-list">
                  {orphanItems.map((i) => {
                    const id = i.id as string;
                    return (
                      <li key={id} className="tree-item">
                        <button
                          type="button"
                          className={`tree-item__button ${
                            isSelected(EntityKind.Item, id) ? 'tree-item__button--selected' : ''
                          }`}
                          onClick={() => setSel({ kind: EntityKind.Item, id })}
                        >
                          ◆ {i.label}
                          {dot(EntityKind.Item, id)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </aside>

        <main className="detail-pane">
          <Breadcrumbs tree={t} sel={sel} />
          <div style={{ marginTop: 16 }}>
            <FormPanel
              tree={t}
              sel={sel}
              onSaved={refresh}
              onDeleted={() => {
                setSel({ kind: 'world' });
                refresh();
              }}
            />
          </div>
        </main>

        <ProblemsRail problems={problems} onSelect={(s) => setSel({ kind: s.kind, id: s.id })} />
      </div>

      <CommandPalette
        tree={t}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(s) => setSel({ kind: s.kind, id: s.id })}
      />
    </div>
  );
}

function FormPanel(props: {
  tree: WorldTree;
  sel: Selected;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, sel, onSaved, onDeleted } = props;
  if (sel.kind === 'world') {
    return <p className="t-metadata">Select an entity from the tree, or press ⌘K.</p>;
  }
  if (sel.kind === EntityKind.Location) {
    const loc = tree.locations.find((l) => (l.id as string) === sel.id);
    if (!loc) return <p className="t-metadata">Not found.</p>;
    return (
      <LocationForm
        tree={tree}
        initial={{
          id: loc.id as string,
          label: loc.label,
          shortDescription: loc.shortDescription,
          longDescription: loc.longDescription,
        }}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  return <RawJsonForm tree={tree} sel={sel} onSaved={onSaved} onDeleted={onDeleted} />;
}

function LocationForm(props: {
  tree: WorldTree;
  initial: { id: string; label: string; shortDescription: string; longDescription: string };
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, initial, onSaved, onDeleted } = props;
  const [v, setV] = useState(initial);

  return (
    <div>
      <h2 className="t-headline-md" style={{ marginBottom: 16 }}>
        Location: {v.label}
      </h2>
      <div className="field">
        <label htmlFor="loc-id">ID</label>
        <input id="loc-id" className="input input--readonly" value={v.id} readOnly />
      </div>
      <div className="field">
        <label htmlFor="loc-label">Label</label>
        <input
          id="loc-label"
          className="input"
          value={v.label}
          onChange={(e) => setV({ ...v, label: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="loc-short">Short description</label>
        <input
          id="loc-short"
          className="input"
          value={v.shortDescription}
          onChange={(e) => setV({ ...v, shortDescription: e.target.value })}
        />
      </div>
      <div className="field">
        <span className="t-label-caps" style={{ fontSize: 12 }}>
          Long description
        </span>
        <ManuscriptCard
          entityId={v.id}
          value={v.longDescription}
          onChange={(next) => setV({ ...v, longDescription: next })}
        />
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            await saveEntity({
              data: {
                worldId: tree.summary.id as string,
                entity: EntityKind.Location,
                payload: v,
              },
            });
            onSaved();
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await deleteEntity({
              data: {
                worldId: tree.summary.id as string,
                entity: EntityKind.Location,
                id: v.id,
              },
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

function RawJsonForm(props: {
  tree: WorldTree;
  sel: Exclude<Selected, { kind: 'world' }>;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, sel, onSaved, onDeleted } = props;
  const find = () => {
    if (sel.kind === EntityKind.Agent) return tree.agents.find((a) => (a.id as string) === sel.id);
    if (sel.kind === EntityKind.Item) return tree.items.find((i) => (i.id as string) === sel.id);
    if (sel.kind === EntityKind.MonsterTemplate)
      return tree.templates.find((tpl) => (tpl.id as string) === sel.id);
    if (sel.kind === EntityKind.LocationSpawnTrigger)
      return tree.triggers.find((trg) => (trg.id as string) === sel.id);
    return tree.exits.find((e) => (e.id as string) === sel.id);
  };
  const initial = find();
  const [json, setJson] = useState(JSON.stringify(initial ?? {}, null, 2));
  if (!initial) return <p className="t-metadata">Not found.</p>;

  return (
    <div>
      <h2 className="t-headline-md" style={{ marginBottom: 8 }}>
        {sel.kind}: {sel.id}
      </h2>
      <p className="t-metadata" style={{ fontStyle: 'italic', marginBottom: 16 }}>
        v1 fallback editor — edit fields as JSON, then Save.
      </p>
      <textarea
        className="json-editor"
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={20}
      />
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            // biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns any; we validate in try/catch
            let parsed: any;
            try {
              parsed = JSON.parse(json);
            } catch (e) {
              alert(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
              return;
            }
            const payload =
              sel.kind === EntityKind.Item
                ? {
                    ...parsed,
                    ownerKind: parsed.owner?.kind,
                    ownerId: parsed.owner?.id,
                  }
                : parsed;
            if (sel.kind === EntityKind.MonsterTemplate) {
              await upsertTemplate({
                data: { worldId: tree.summary.id as string, payload },
              });
            } else if (sel.kind === EntityKind.LocationSpawnTrigger) {
              await upsertTrigger({
                data: { worldId: tree.summary.id as string, payload },
              });
            } else {
              await saveEntity({
                data: { worldId: tree.summary.id as string, entity: sel.kind, payload },
              });
            }
            onSaved();
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (sel.kind === EntityKind.MonsterTemplate) {
              await deleteTemplate({
                data: { worldId: tree.summary.id as string, id: sel.id },
              });
            } else if (sel.kind === EntityKind.LocationSpawnTrigger) {
              await deleteTrigger({
                data: { worldId: tree.summary.id as string, id: sel.id },
              });
            } else {
              await deleteEntity({
                data: { worldId: tree.summary.id as string, entity: sel.kind, id: sel.id },
              });
            }
            onDeleted();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
