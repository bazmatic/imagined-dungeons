import { EntityKind, WorldKind } from '@core/domain/builder-kinds';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { validate } from '~/server/admin/validate';
import { getWorld } from '~/server/admin/worlds';
import { AdminShell } from './-components/AdminShell';
import { Breadcrumbs } from './-components/Breadcrumbs';
import { useCategoryRouter } from './-components/CategoryRouter';
import { CommandPalette } from './-components/CommandPalette';
import { Fonts } from './-components/Fonts';
import { ProblemsRail } from './-components/ProblemsRail';
import { WorldSettingsForm } from './-components/WorldSettingsForm';
import { type AdminSearch, CategoryKind, parseSearchParams } from './-components/category-helpers';

export const Route = createFileRoute('/admin/$worldId')({
  component: AdminWorld,
  validateSearch: (raw): AdminSearch => parseSearchParams(raw),
  loader: async ({ params }) => {
    const tree = await getWorld({ data: { id: params.worldId } });
    const v = await validate({ data: { id: params.worldId } });
    return { tree, problems: v.ok ? v.value : [] };
  },
});

function AdminWorld() {
  const { tree, problems } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);

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

  const setCategory = (cat: AdminSearch['cat']): void => {
    void navigate({ search: { cat } });
  };
  const setSelected = (sel: string | undefined): void => {
    void navigate({
      search: (prev) => {
        const base = { cat: prev.cat };
        return sel === undefined ? base : { ...base, sel };
      },
    });
  };
  const openWorldSettings = (): void => {
    void navigate({
      search: (prev) => ({ cat: prev.cat, view: 'settings' as const }),
    });
  };

  const { masterList, detail } = useCategoryRouter({
    tree: t,
    category: search.cat,
    ...(search.sel !== undefined ? { selectedId: search.sel } : {}),
    problems,
    onSelect: setSelected,
    onSaved: refresh,
    onDeleted: () => {
      setSelected(undefined);
      refresh();
    },
  });

  const showingSettings = search.view === 'settings';

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
          onWorldSettings: openWorldSettings,
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
          active: search.cat,
          onSelect: setCategory,
          onCreateNew: () => setPaletteOpen(true),
        }}
      >
        <div className="detail-shell-v2">
          <section className="master-pane">
            <div className="master-pane__header">
              <span className="t-label-caps">
                {search.cat === CategoryKind.Locations
                  ? 'Locations'
                  : search.cat === CategoryKind.Bestiary
                    ? 'Bestiary'
                    : search.cat === CategoryKind.Agents
                      ? 'Agents'
                      : search.cat === CategoryKind.Lore
                        ? 'Lore'
                        : 'Items'}
              </span>
            </div>
            {masterList}
          </section>

          <section className="detail-pane-v2">
            <div className="detail-pane-v2__inner">
              <Breadcrumbs
                tree={t}
                sel={
                  showingSettings || search.cat === CategoryKind.Lore
                    ? { kind: 'world' }
                    : search.sel !== undefined
                      ? ({ kind: categoryToEntityKind(search.cat), id: search.sel } as never)
                      : { kind: 'world' }
                }
              />
              {showingSettings ? <WorldSettingsForm tree={t} onSaved={refresh} /> : detail}
            </div>
          </section>
        </div>
      </AdminShell>

      <CommandPalette
        tree={t}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(s) => {
          // route the palette pick to the right category
          const cat = entityKindToCategory(s.kind);
          if (cat === null) return; // exits and triggers are inline on Location
          void navigate({ search: { cat, sel: s.id } });
        }}
      />
      <ProblemsRail
        problems={problems}
        open={problemsOpen}
        onClose={() => setProblemsOpen(false)}
        onSelect={(s) => {
          const cat = entityKindToCategory(s.kind);
          if (cat === null) return;
          void navigate({ search: { cat, sel: s.id } });
          setProblemsOpen(false);
        }}
      />
    </div>
  );
}

function entityKindToCategory(kind: string): AdminSearch['cat'] | null {
  if (kind === EntityKind.Location) return CategoryKind.Locations;
  if (kind === EntityKind.Agent) return CategoryKind.Agents;
  if (kind === EntityKind.Item) return CategoryKind.Items;
  if (kind === EntityKind.MonsterTemplate) return CategoryKind.Bestiary;
  return null; // exit, trigger — they live inline on Location
}

function categoryToEntityKind(cat: AdminSearch['cat']): string {
  if (cat === CategoryKind.Locations) return EntityKind.Location;
  if (cat === CategoryKind.Agents) return EntityKind.Agent;
  if (cat === CategoryKind.Items) return EntityKind.Item;
  return EntityKind.MonsterTemplate;
}
