import { createFileRoute, Link } from '@tanstack/react-router';
import { listLiveWorlds } from '~/server/list-live-worlds';

export const Route = createFileRoute('/')({
  component: WorldPickerPage,
  loader: async () => await listLiveWorlds(),
});

function WorldPickerPage() {
  const worlds = Route.useLoaderData();

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 32,
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0, opacity: 0.8 }}>
        Imagined Dungeons
      </h1>
      {worlds.length === 0 ? (
        <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No worlds available. Create one in the admin panel.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {worlds.map((w) => (
            <li key={w.id}>
              <Link
                to="/play/$worldId"
                params={{ worldId: w.id }}
                style={{
                  display: 'block',
                  padding: '12px 24px',
                  border: '1px solid #333',
                  color: '#cfcfcf',
                  textDecoration: 'none',
                  fontSize: 16,
                  letterSpacing: '0.05em',
                }}
              >
                {w.displayName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
