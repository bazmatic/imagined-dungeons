import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => <main style={{ padding: 24 }}>Imagined Dungeons — booting…</main>,
});
