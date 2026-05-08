import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/$worldId')({
  component: AdminWorldPlaceholder,
});

function AdminWorldPlaceholder() {
  const { worldId } = Route.useParams();
  return <h1>TODO: editor for {worldId}</h1>;
}
