import type { Problem, WorldTree } from '@core/domain/builder-types';
import { type ReactNode, useState } from 'react';
import { upsertTagLore } from '~/server/admin/lore';
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
import { sanitizeTag } from './tags-codec';

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
        category === CategoryKind.Lore ? (
          <NewTagAffordance
            tree={tree}
            onCreated={(tag) => {
              setJsonFallback(null);
              onSelect(tag);
              onSaved();
            }}
          />
        ) : (
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
    const worldRow: MasterListItem = { id: WORLD_LORE_SEL, label: 'World lore' };
    const tagRows: MasterListItem[] = tags.map((tag) => ({
      id: tag,
      label: tag,
      subtitle: 'authored',
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

function randomTagLoreId(): string {
  return `tlr_${Math.random().toString(36).slice(2, 10)}`;
}

interface NewTagAffordanceProps {
  readonly tree: WorldTree;
  readonly onCreated: (tag: string) => void;
}

function NewTagAffordance({ tree, onCreated }: NewTagAffordanceProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const close = (): void => {
    setOpen(false);
    setDraft('');
  };
  const existing = new Set(tree.tagLore.map((t) => t.tag));
  const sanitized = sanitizeTag(draft);
  const isDuplicate = sanitized !== null && existing.has(sanitized);
  const canSubmit = sanitized !== null && !isDuplicate;

  const submit = async (): Promise<void> => {
    if (busy || !canSubmit || sanitized === null) return;
    setBusy(true);
    try {
      const id = randomTagLoreId();
      const r = await upsertTagLore({
        data: {
          worldId: tree.summary.id as string,
          payload: { id, tag: sanitized, title: '', description: '' },
        },
      });
      if (!r.ok) {
        alert(`Create failed: ${r.error.message}`);
        return;
      }
      onCreated(sanitized);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="create-affordance">
      {open ? (
        <div className="row-editor" style={{ margin: 0 }}>
          <div className="row-editor__field">
            <label className="row-editor__field-label" htmlFor="new-tag-name">
              Tag name
            </label>
            <input
              // biome-ignore lint/a11y/noAutofocus: inline create affordance — focus is the user-expected effect of clicking "+ New tag"
              autoFocus
              id="new-tag-name"
              type="text"
              className="row-editor__input"
              placeholder="lowercase, no spaces"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
                if (e.key === 'Escape') close();
              }}
            />
            {isDuplicate ? (
              <span className="t-metadata" style={{ fontSize: '0.85em', opacity: 0.7 }}>
                Tag already exists.
              </span>
            ) : null}
          </div>
          <div className="row-editor__actions">
            <button type="button" className="btn" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={submit}
              disabled={busy || !canSubmit}
            >
              Create
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
          + New tag
        </button>
      )}
    </div>
  );
}

function singular(c: Category): string {
  if (c === CategoryKind.Locations) return 'location';
  if (c === CategoryKind.Bestiary) return 'template';
  if (c === CategoryKind.Agents) return 'agent';
  if (c === CategoryKind.Lore) return 'lore entry';
  return 'item';
}
