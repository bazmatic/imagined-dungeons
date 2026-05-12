import { WorldKind } from '@core/domain/builder-kinds';
import type { WorldSummaryWithStats } from '@core/domain/builder-types';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { createWorld, listWorlds } from '~/server/admin/worlds';
import { AdminShell } from './-components/AdminShell';
import { Fonts } from './-components/Fonts';
import { NewWorldCard } from './-components/NewWorldCard';
import { CategoryKind } from './-components/category-helpers';

export const Route = createFileRoute('/admin/')({
  component: AdminIndex,
  loader: async () => ({ worlds: await listWorlds() }),
});

/**
 * In the new Load/Save/Reset model, each "thing" has a scratch (Draft) world
 * for editing the starting state and a live (Live) world for the running
 * game. The live row's `parentDraftId` links it to its scratch.
 *
 * We surface one card per *thing*: prefer the scratch's metadata, and show
 * an "Edit live" button when a paired live world exists.
 */
interface CampaignCard {
  readonly scratch: WorldSummaryWithStats | null;
  readonly live: WorldSummaryWithStats | null;
}

function groupIntoCampaigns(worlds: readonly WorldSummaryWithStats[]): readonly CampaignCard[] {
  const byScratch = new Map<string, CampaignCard>();
  const orphanLives: WorldSummaryWithStats[] = [];
  const orphanScratches: WorldSummaryWithStats[] = [];

  for (const w of worlds) {
    if (w.kind === WorldKind.Draft) {
      byScratch.set(w.id as string, { scratch: w, live: null });
    }
  }
  for (const w of worlds) {
    if (w.kind === WorldKind.Live) {
      const link = w.parentDraftId as string | null;
      if (link && byScratch.has(link)) {
        const entry = byScratch.get(link);
        if (entry) byScratch.set(link, { scratch: entry.scratch, live: w });
      } else {
        orphanLives.push(w);
      }
    }
  }
  for (const [, card] of byScratch) {
    if (!card.scratch && !card.live) orphanScratches.push();
  }
  const cards: CampaignCard[] = Array.from(byScratch.values());
  for (const live of orphanLives) cards.push({ scratch: null, live });
  return cards;
}

function AdminIndex() {
  const { worlds } = Route.useLoaderData();
  const router = useRouter();
  const cards = groupIntoCampaigns(worlds);

  const onCreate = async (input: { displayName: string; label: string }): Promise<void> => {
    await createWorld({ data: input });
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
              <h1 className="workspace-card__title">World Builder</h1>
              <p className="workspace-card__lede">
                Each world has a scratch page where you edit the starting state, and a live
                world that runs the game. Save commits your scratch as the starting state; Reset
                rewinds the live world back to it.
              </p>
            </div>
          </aside>

          <section className="index-main">
            <div>
              <header className="section-heading">
                <div>
                  <h2 className="section-heading__title">Campaigns</h2>
                </div>
                <span className="section-heading__count">
                  {cards.length} {cards.length === 1 ? 'Realm' : 'Realms'}
                </span>
              </header>

              <NewWorldCard onCreate={onCreate} />

              <div className="drafts-table">
                <div className="drafts-table__head">
                  <div>Designation</div>
                  <div>ID</div>
                  <div style={{ textAlign: 'right' }}>Actions</div>
                </div>
                {cards.length === 0 ? (
                  <p className="t-metadata" style={{ fontStyle: 'italic', padding: 'var(--s-4)' }}>
                    No campaigns yet.
                  </p>
                ) : (
                  cards.map((card) => {
                    const primary = card.scratch ?? card.live;
                    if (!primary) return null;
                    const key = (card.scratch?.id ?? card.live?.id) as string;
                    return (
                      <div key={key} className="drafts-table__row">
                        <div className="drafts-table__designation">
                          <span className="drafts-table__name">
                            {primary.displayName || primary.label}
                          </span>
                          <span className="drafts-table__label">{primary.label}</span>
                        </div>
                        <div className="t-data-sm" style={{ color: 'var(--parchment-dim)' }}>
                          {card.scratch ? (card.scratch.id as string) : '—'}
                          {card.live ? ` / ${card.live.id as string}` : ''}
                        </div>
                        <div
                          style={{
                            textAlign: 'right',
                            display: 'flex',
                            gap: 8,
                            justifyContent: 'flex-end',
                          }}
                        >
                          {card.scratch ? (
                            <Link
                              to="/admin/$worldId"
                              params={{ worldId: card.scratch.id as string }}
                              search={{ cat: CategoryKind.Locations }}
                              className="btn"
                              style={{ textDecoration: 'none' }}
                            >
                              Edit starting state
                            </Link>
                          ) : null}
                          {card.live ? (
                            <Link
                              to="/admin/$worldId"
                              params={{ worldId: card.live.id as string }}
                              search={{ cat: CategoryKind.Locations }}
                              className="btn"
                              style={{ textDecoration: 'none' }}
                            >
                              Edit live
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <aside className="directive">
              <div className="directive__heading">Scholar's Directive</div>
              <p className="directive__quote">
                "The starting state is the seed; the live world is the garden. Save what you mean to
                plant; reset only when the season turns."
              </p>
              <div className="directive__attrib">— Archivist Malachi</div>
            </aside>
          </section>
        </div>
      </AdminShell>
    </div>
  );
}
