import { WorldKind } from '@core/domain/builder-kinds';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { cloneLive, createDraft, listWorlds } from '~/server/admin/worlds';

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
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Campaign Builder</h1>
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Drafts</h2>
        {drafts.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No drafts yet.</p>
        ) : (
          <ul>
            {drafts.map((w) => (
              <li key={w.id as string}>
                <Link to="/admin/$worldId" params={{ worldId: w.id as string }}>
                  {w.displayName || w.label} ({w.id as string})
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            style={{ background: '#111', color: '#cfcfcf', border: '1px solid #333', padding: 4 }}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="World label"
            style={{ background: '#111', color: '#cfcfcf', border: '1px solid #333', padding: 4 }}
          />
          <button type="button" onClick={onCreate}>
            New draft
          </button>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Live worlds</h2>
        {liveWorlds.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No live worlds.</p>
        ) : (
          <ul>
            {liveWorlds.map((w) => (
              <li key={w.id as string} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Link to="/admin/$worldId" params={{ worldId: w.id as string }}>
                  {w.displayName || w.label} ({w.id as string})
                </Link>
                {w.parentDraftId === null && (
                  <button
                    type="button"
                    onClick={async () => {
                      await cloneLive({ data: { id: w.id as string } });
                      router.invalidate();
                    }}
                  >
                    Clone as draft
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
