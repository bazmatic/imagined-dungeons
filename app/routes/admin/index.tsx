import { WorldKind } from '@core/domain/builder-kinds';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { cloneLive, createDraft, listWorlds } from '~/server/admin/worlds';
import { AdminShell } from './-components/AdminShell';
import { Fonts } from './-components/Fonts';
import { HeroWorldCard } from './-components/HeroWorldCard';
import { InscribeCard } from './-components/InscribeCard';
import { CategoryKind } from './-components/category-helpers';

export const Route = createFileRoute('/admin/')({
  component: AdminIndex,
  loader: async () => ({ worlds: await listWorlds() }),
});

function AdminIndex() {
  const { worlds } = Route.useLoaderData();
  const router = useRouter();

  const drafts = worlds.filter((w) => w.kind === WorldKind.Draft);
  const liveWorlds = worlds.filter((w) => w.kind === WorldKind.Live);

  const onCreate = async (input: { displayName: string; label: string }): Promise<void> => {
    await createDraft({ data: input });
    router.invalidate();
  };

  return (
    <div className="admin-root">
      <Fonts />
      <AdminShell
        route="index"
        topBar={{
          activeTab: 'draft',
          onSearch: () => undefined,
        }}
      >
        <div className="index-page-v2">
          <aside className="workspace-card">
            <div>
              <div className="workspace-card__eyebrow">Workspace</div>
              <h1 className="workspace-card__title">Campaign Builder</h1>
              <p className="workspace-card__lede">
                Organize the threads of fate across your existing realms and nascent visions.
              </p>
            </div>
            <div className="quick-actions">
              <div className="quick-actions__heading">Quick Actions</div>
              <button
                type="button"
                className="quick-actions__item"
                onClick={() => {
                  // No-op for now; the palette lives on the detail route.
                  // Future work: surface a global palette here too.
                }}
              >
                ⌘K — Open Command Palette (Detail only)
              </button>
              <Link to="/admin" className="quick-actions__item" style={{ textDecoration: 'none' }}>
                Refresh world list
              </Link>
            </div>
          </aside>

          <section className="index-main">
            <div>
              <header className="section-heading">
                <div>
                  <h2 className="section-heading__title">Nascent Visions</h2>
                  <span className="section-heading__suffix">(Drafts)</span>
                </div>
                <span className="section-heading__count">
                  {drafts.length} Working {drafts.length === 1 ? 'Draft' : 'Drafts'}
                </span>
              </header>

              <InscribeCard onCreate={onCreate} />

              <div className="drafts-table">
                <div className="drafts-table__head">
                  <div>Designation</div>
                  <div>ID</div>
                  <div>Status</div>
                  <div style={{ textAlign: 'right' }}>Actions</div>
                </div>
                {drafts.length === 0 ? (
                  <p className="t-metadata" style={{ fontStyle: 'italic', padding: 'var(--s-4)' }}>
                    No drafts yet.
                  </p>
                ) : (
                  drafts.map((w) => (
                    <div key={w.id as string} className="drafts-table__row">
                      <div className="drafts-table__designation">
                        <Link
                          to="/admin/$worldId"
                          params={{ worldId: w.id as string }}
                          search={{ cat: CategoryKind.Locations }}
                          className="drafts-table__name"
                          style={{ textDecoration: 'none' }}
                        >
                          {w.displayName || w.label}
                        </Link>
                        <span className="drafts-table__label">{w.label}</span>
                      </div>
                      <div className="t-data-sm" style={{ color: 'var(--parchment-dim)' }}>
                        {w.id as string}
                      </div>
                      <div>
                        <span className="chip chip--gold">Draft</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Link
                          to="/admin/$worldId"
                          params={{ worldId: w.id as string }}
                          search={{ cat: CategoryKind.Locations }}
                          className="btn"
                          style={{ textDecoration: 'none' }}
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <header className="section-heading">
                <div>
                  <h2 className="section-heading__title">The Manifested</h2>
                  <span className="section-heading__suffix">(Live Worlds)</span>
                </div>
                <span className="section-heading__count">
                  {liveWorlds.length} Synchronized {liveWorlds.length === 1 ? 'Realm' : 'Realms'}
                </span>
              </header>
              {liveWorlds.length === 0 ? (
                <p className="t-metadata" style={{ fontStyle: 'italic' }}>
                  No live worlds.
                </p>
              ) : (
                <div className="hero-grid">
                  {liveWorlds.map((w) => (
                    <div key={w.id as string}>
                      <HeroWorldCard world={w} />
                      {w.parentDraftId === null && (
                        <button
                          type="button"
                          className="btn"
                          style={{ marginTop: 8 }}
                          onClick={async () => {
                            await cloneLive({ data: { id: w.id as string } });
                            router.invalidate();
                          }}
                        >
                          Clone as draft
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className="directive">
              <div className="directive__heading">Scholar's Directive</div>
              <p className="directive__quote">
                "Every world is a living document. Remember that drafts are the crucible of
                creation; do not fear the mess of incomplete lore. The Archive rewards the
                meticulous, but the heart of worldbuilding lies in the silence between entries."
              </p>
              <div className="directive__attrib">— Archivist Malachi</div>
            </aside>
          </section>
        </div>
      </AdminShell>
    </div>
  );
}
