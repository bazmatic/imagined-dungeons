import type { Problem, WorldTree } from '@core/domain/builder-types';
import { type ReactNode, useState } from 'react';
import { AgentForm } from './AgentForm';
import { ItemForm } from './ItemForm';
import { LocationForm } from './LocationForm';
import { MasterList, type MasterListItem } from './MasterList';
import { TemplateForm } from './TemplateForm';
import { type Category, resolveOwnerSubtitle } from './category-helpers';

export interface CategoryRouterProps {
  readonly tree: WorldTree;
  readonly category: Category;
  readonly selectedId?: string;
  readonly problems: readonly Problem[];
  readonly onSelect: (id: string | undefined) => void;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
}

export function useCategoryRouter({
  tree,
  category,
  selectedId,
  problems,
  onSelect,
  onSaved,
  onDeleted,
}: CategoryRouterProps): { masterList: ReactNode; detail: ReactNode } {
  const items = listItemsForCategory(category, tree);
  const [jsonFallback, setJsonFallback] = useState<string | null>(null);

  const masterList = (
    <MasterList
      items={items}
      {...(selectedId !== undefined ? { selectedId } : {})}
      onSelect={(id) => {
        setJsonFallback(null);
        onSelect(id);
      }}
      filterPlaceholder={`Filter ${category}…`}
    />
  );

  const detail = renderDetail({
    tree,
    category,
    selectedId,
    problems,
    jsonFallback,
    onJsonFallback: setJsonFallback,
    onSaved,
    onDeleted,
  });

  return { masterList, detail };
}

function listItemsForCategory(category: Category, tree: WorldTree): readonly MasterListItem[] {
  if (category === 'locations') {
    return tree.locations.map((l) => ({ id: l.id as string, label: l.label }));
  }
  if (category === 'bestiary') {
    return tree.templates.map((t) => ({ id: t.id as string, label: t.label }));
  }
  if (category === 'agents') {
    return tree.agents.map((a) => {
      const loc = tree.locations.find((l) => (l.id as string) === (a.locationId as string));
      return {
        id: a.id as string,
        label: a.label,
        subtitle: loc ? `in ${loc.label}` : '(unplaced)',
      };
    });
  }
  return tree.items.map((it) => ({
    id: it.id as string,
    label: it.label,
    subtitle: resolveOwnerSubtitle(it, tree.locations, tree.agents, tree.items),
  }));
}

function renderDetail(args: {
  tree: WorldTree;
  category: Category;
  selectedId: string | undefined;
  problems: readonly Problem[];
  jsonFallback: string | null;
  onJsonFallback: (id: string | null) => void;
  onSaved: () => void;
  onDeleted: () => void;
}): ReactNode {
  const { tree, category, selectedId, problems, onJsonFallback, onSaved, onDeleted } = args;
  if (selectedId === undefined) {
    return (
      <p className="t-metadata" style={{ fontStyle: 'italic' }}>
        Select a {singular(category)} from the list to the left.
      </p>
    );
  }
  const problemCount = problems.filter((p) => p.entityId === selectedId).length;
  if (category === 'locations') {
    return (
      <LocationForm
        tree={tree}
        locationId={selectedId}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  if (category === 'bestiary') {
    return (
      <TemplateForm
        tree={tree}
        templateId={selectedId}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  if (category === 'agents') {
    return (
      <AgentForm
        tree={tree}
        agentId={selectedId}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  // items
  return (
    <ItemForm
      tree={tree}
      itemId={selectedId}
      problemCount={problemCount}
      onSaved={onSaved}
      onDeleted={onDeleted}
      onRequestJsonFallback={() => onJsonFallback(selectedId)}
    />
  );
  // jsonFallback handled by $worldId.tsx itself (it opens a dedicated overlay or replaces the form)
}

function singular(c: Category): string {
  if (c === 'locations') return 'location';
  if (c === 'bestiary') return 'template';
  if (c === 'agents') return 'agent';
  return 'item';
}
