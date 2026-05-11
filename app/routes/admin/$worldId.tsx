import { EntityKind, WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
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
import { getWorld, updateWorldCover } from '~/server/admin/worlds';
import { AdminShell } from './-components/AdminShell';
import { Breadcrumbs } from './-components/Breadcrumbs';
import { CommandPalette } from './-components/CommandPalette';
import { EntityHeader } from './-components/EntityHeader';
import { Fonts } from './-components/Fonts';
import { FootnoteBar } from './-components/FootnoteBar';
import { KeyVisualPanel } from './-components/KeyVisualPanel';
import { ManuscriptCard } from './-components/ManuscriptCard';
import { MetadataColumn } from './-components/MetadataColumn';
import { ProblemsRail } from './-components/ProblemsRail';
import { TagsPanel } from './-components/TagsPanel';
import { type SelectedRef, WorldHierarchyTree } from './-components/WorldHierarchyTree';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export const Route = createFileRoute('/admin/$worldId')({
  component: AdminWorld,
  loader: async ({ params }) => {
    const tree = await getWorld({ data: { id: params.worldId } });
    const v = await validate({ data: { id: params.worldId } });
    return { tree, problems: v.ok ? v.value : [] };
  },
});

function AdminWorld() {
  const { tree, problems } = Route.useLoaderData();
  const router = useRouter();
  const [sel, setSel] = useState<SelectedRef>({ kind: 'world' });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);

  const problemDots = useMemo<ReadonlySet<string>>(() => {
    const s = new Set<string>();
    for (const p of problems) s.add(`${p.entity}:${p.entityId}`);
    return s;
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
  const isDraft = t.summary.kind === WorldKind.Draft;

  const refresh = (): void => {
    void router.invalidate();
  };

  const onPublish = async (): Promise<void> => {
    const r = await publish({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Publish failed: ${r.error.message}`);
    else alert(`Published. Skipped: ${r.value.skipped.length}`);
  };
  const onReset = async (): Promise<void> => {
    if (!confirm('Reset live world to this draft? This replaces live structural rows.')) return;
    const r = await resetLive({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Reset failed: ${r.error.message}`);
  };

  return (
    <div className="admin-root">
      <Fonts />
      <AdminShell
        route="detail"
        topBar={{
          activeTab: isDraft ? 'draft' : 'live',
          showDraftChip: isDraft,
          onSearch: () => setPaletteOpen(true),
          onPaletteOpen: () => setPaletteOpen(true),
          ...(isDraft ? { onPublish, onReset } : {}),
          extra: (
            <button
              type="button"
              className="btn"
              onClick={() => setProblemsOpen((p) => !p)}
              title="Problems"
            >
              ⚑ {problems.length}
            </button>
          ),
        }}
        sideNav={{
          active: 'locations',
          onSelect: () => undefined,
          onCreateNew: () => setPaletteOpen(true),
        }}
      >
        <div className="detail-shell-v2">
          <section className="master-pane">
            <div className="master-pane__header">
              <span className="t-label-caps">World Hierarchy</span>
            </div>
            <WorldHierarchyTree tree={t} sel={sel} onSelect={setSel} problemDots={problemDots} />
          </section>

          <section className="detail-pane-v2">
            <div className="detail-pane-v2__inner">
              <Breadcrumbs tree={t} sel={sel as never} />
              <DetailBody
                tree={t}
                sel={sel}
                problemCount={
                  sel.kind !== 'world' && sel.id !== undefined
                    ? problems.filter((p) => p.entity === sel.kind && p.entityId === sel.id).length
                    : problems.length
                }
                onSaved={refresh}
                onDeleted={() => {
                  setSel({ kind: 'world' });
                  refresh();
                }}
                onCoverChange={async (next) => {
                  await updateWorldCover({
                    data: { id: t.summary.id as string, coverImageUrl: next },
                  });
                  refresh();
                }}
              />
            </div>
          </section>
        </div>
      </AdminShell>

      <CommandPalette
        tree={t}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(s) => setSel({ kind: s.kind, id: s.id })}
      />
      <ProblemsRail
        problems={problems}
        open={problemsOpen}
        onClose={() => setProblemsOpen(false)}
        onSelect={(s) => {
          setSel({ kind: s.kind, id: s.id });
          setProblemsOpen(false);
        }}
      />
    </div>
  );
}

function DetailBody(props: {
  tree: WorldTree;
  sel: SelectedRef;
  problemCount: number;
  onSaved: () => void;
  onDeleted: () => void;
  onCoverChange: (next: string | null) => Promise<void>;
}) {
  const { tree, sel, problemCount, onSaved, onDeleted, onCoverChange } = props;
  if (sel.kind === 'world') {
    const name = tree.summary.displayName || tree.summary.label;
    return (
      <>
        <EntityHeader kindLabel="World" title={name} id={tree.summary.id as string} />
        <div className="form-grid">
          <div className="form-grid__primary">
            <p className="t-metadata" style={{ fontStyle: 'italic' }}>
              Select an entity in the tree, or press ⌘K.
            </p>
          </div>
          <MetadataColumn>
            <KeyVisualPanel
              src={tree.summary.coverImageUrl}
              fallbackLetter={(name[0] ?? '?').toUpperCase()}
              editable
              onChange={onCoverChange}
            />
          </MetadataColumn>
        </div>
      </>
    );
  }

  if (sel.kind === EntityKind.Location && sel.id !== undefined) {
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
          tags: loc.tags,
        }}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }

  return (
    <RawJsonForm
      tree={tree}
      sel={sel as { kind: EntityKindValue; id: string }}
      onSaved={onSaved}
      onDeleted={onDeleted}
    />
  );
}

function LocationForm(props: {
  tree: WorldTree;
  initial: {
    id: string;
    label: string;
    shortDescription: string;
    longDescription: string;
    tags: readonly string[];
  };
  problemCount: number;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, initial, problemCount, onSaved, onDeleted } = props;
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);

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
          entity: EntityKind.Location,
          payload: v,
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <EntityHeader kindLabel="Location" title={v.label || initial.id} id={initial.id} />
      <div className="form-grid">
        <div className="form-grid__primary">
          <div>
            <label htmlFor="loc-label" className="form-grid__field-label">
              Label
            </label>
            <input
              id="loc-label"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="loc-short" className="form-grid__field-label">
              Short Description
            </label>
            <input
              id="loc-short"
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
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              Save
            </button>
          </div>
        </div>
        <MetadataColumn>
          <KeyVisualPanel
            src={tree.summary.coverImageUrl}
            fallbackLetter={(v.label[0] ?? '?').toUpperCase()}
            editable={false}
          />
          <div>
            <span className="form-grid__field-label">Attributes &amp; Tags</span>
            <TagsPanel tags={v.tags} onChange={(next) => setV({ ...v, tags: next })} />
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
              entity: EntityKind.Location,
              id: initial.id,
            },
          });
          onDeleted();
        }}
      />
    </>
  );
}

function RawJsonForm(props: {
  tree: WorldTree;
  sel: { kind: EntityKindValue; id: string };
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
    <>
      <EntityHeader kindLabel={sel.kind} title={sel.id} />
      <p className="t-metadata" style={{ fontStyle: 'italic', marginBottom: 16 }}>
        Machine edit — structured editor coming soon. Edit JSON, then Save.
      </p>
      <textarea
        className="json-editor"
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={24}
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
    </>
  );
}
