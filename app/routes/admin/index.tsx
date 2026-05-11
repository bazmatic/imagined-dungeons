import { WorldKind } from '@core/domain/builder-kinds';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { cloneLive, createDraft, listWorlds } from '~/server/admin/worlds';
import { Fonts } from './_components/Fonts';

export const Route = createFileRoute('/admin/')({
  component: AdminIndex,
  loader: async () => ({ worlds: await listWorlds() }),
});

function AdminIndex() {
  const { worlds } = Route.useLoaderData();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [label, setLabel] = useState('');

  const onCreate = async (): Promise<void> => {
    if (!displayName || !label) return;
    await createDraft({ data: { displayName, label } });
    router.invalidate();
    setDisplayName('');
    setLabel('');
  };

  const drafts = worlds.filter((w) => w.kind === WorldKind.Draft);
  const liveWorlds = worlds.filter((w) => w.kind === WorldKind.Live);

  return (
    <div className="admin-root">
      <Fonts />
      <div className="index-page">
        <header>
          <h1 className="t-headline-lg">Campaign Builder</h1>
          <p className="t-metadata">Drafts and live worlds.</p>
        </header>

        <section>
          <h2 className="t-label-caps" style={{ marginBottom: 12 }}>
            Drafts
          </h2>
          {drafts.length === 0 ? (
            <p className="t-metadata" style={{ fontStyle: 'italic' }}>
              No drafts yet.
            </p>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((w) => (
                  <tr key={w.id as string}>
                    <td>
                      <Link to="/admin/$worldId" params={{ worldId: w.id as string }}>
                        {w.displayName || w.label}
                      </Link>
                    </td>
                    <td style={{ color: 'var(--parchment-dim)' }}>{w.id as string}</td>
                    <td>
                      <span className="chip chip--gold">DRAFT</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="newDraftDisplay">Display name</label>
              <input
                id="newDraftDisplay"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="newDraftLabel">World label</label>
              <input
                id="newDraftLabel"
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn--primary" onClick={onCreate}>
              New draft
            </button>
          </div>
        </section>

        <section>
          <h2 className="t-label-caps" style={{ marginBottom: 12 }}>
            Live worlds
          </h2>
          {liveWorlds.length === 0 ? (
            <p className="t-metadata" style={{ fontStyle: 'italic' }}>
              No live worlds.
            </p>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {liveWorlds.map((w) => (
                  <tr key={w.id as string}>
                    <td>
                      <Link to="/admin/$worldId" params={{ worldId: w.id as string }}>
                        {w.displayName || w.label}
                      </Link>
                    </td>
                    <td style={{ color: 'var(--parchment-dim)' }}>{w.id as string}</td>
                    <td>
                      <span className="chip chip--crimson">LIVE</span>
                    </td>
                    <td>
                      {w.parentDraftId === null && (
                        <button
                          type="button"
                          className="btn"
                          onClick={async () => {
                            await cloneLive({ data: { id: w.id as string } });
                            router.invalidate();
                          }}
                        >
                          Clone as draft
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
