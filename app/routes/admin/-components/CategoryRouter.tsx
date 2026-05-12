import type { Problem, WorldTree } from '@core/domain/builder-types';
import { type ReactNode, useState } from 'react';
import { AgentForm } from './AgentForm';
import { CreateAffordance } from './CreateAffordance';
import { ItemForm } from './ItemForm';
import { LocationForm } from './LocationForm';
import { MasterList, type MasterListItem } from './MasterList';
import { TagLoreForm } from './TagLoreForm';
import { TemplateForm } from './TemplateForm';
import { WorldLoreForm } from './WorldLoreForm';
import { type Category, CategoryKind, resolveOwnerSubtitle } from './category-helpers';
import { WORLD_LORE_SEL, collectLoreTags } from './lore-helpers';

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
      header={
        category === CategoryKind.Lore ? null : (
          <CreateAffordance
            tree={tree}
            category={category}
            onCreated={(id) => {
              setJsonFallback(null);
              onSelect(id);
              onSaved();
            }}
          />
        )
      }
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
  if (category === CategoryKind.Locations) {
    return tree.locations.map((l) => ({ id: l.id as string, label: l.label }));
  }
  if (category === CategoryKind.Bestiary) {
    return tree.templates.map((t) => ({ id: t.id as string, label: t.label }));
  }
  if (category === CategoryKind.Agents) {
    return tree.agents.map((a) => {
      const loc = tree.locations.find((l) => (l.id as string) === (a.locationId as string));
      return {
        id: a.id as string,
        label: a.label,
        subtitle: loc ? `in ${loc.label}` : '(unplaced)',
      };
    });
  }
  if (category === CategoryKind.Lore) {
    const tags = collectLoreTags(tree);
    const authored = new Set(tree.tagLore.map((t) => t.tag));
    const worldRow: MasterListItem = { id: WORLD_LORE_SEL, label: 'World lore' };
    const tagRows: MasterListItem[] = tags.map((tag) => ({
      id: tag,
      label: tag,
      subtitle: authored.has(tag) ? 'authored' : '+ add description',
    }));
    return [worldRow, ...tagRows];
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
  if (category === CategoryKind.Lore) {
    if (selectedId === WORLD_LORE_SEL) {
      return (
        <WorldLoreForm key="world-lore" tree={tree} problemCount={problemCount} onSaved={onSaved} />
      );
    }
    return (
      <TagLoreForm
        key={`tag-lore-${selectedId}`}
        tree={tree}
        tag={selectedId}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  if (category === CategoryKind.Locations) {
    return (
      <LocationForm
        key={selectedId}
        tree={tree}
        locationId={selectedId}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  if (category === CategoryKind.Bestiary) {
    return (
      <TemplateForm
        key={selectedId}
        tree={tree}
        templateId={selectedId}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  if (category === CategoryKind.Agents) {
    return (
      <AgentForm
        key={selectedId}
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
      key={selectedId}
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
  if (c === CategoryKind.Locations) return 'location';
  if (c === CategoryKind.Bestiary) return 'template';
  if (c === CategoryKind.Agents) return 'agent';
  if (c === CategoryKind.Lore) return 'lore entry';
  return 'item';
}
