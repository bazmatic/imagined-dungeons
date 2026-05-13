import { type Category, CategoryKind } from './category-helpers';

export interface SideNavProps {
  readonly active: Category;
  readonly onSelect: (c: Category) => void;
  readonly onCreateNew?: () => void;
}

const ITEMS: ReadonlyArray<{
  readonly key: Category;
  readonly label: string;
}> = [
  { key: CategoryKind.Locations, label: 'Locations' },
  { key: CategoryKind.Bestiary, label: 'Bestiary' },
  { key: CategoryKind.Agents, label: 'Agents' },
  { key: CategoryKind.Items, label: 'Items' },
  { key: CategoryKind.Lore, label: 'Lore' },
];

export function SideNav({ active, onSelect, onCreateNew }: SideNavProps) {
  return (
    <aside className="side-nav">
      <ul className="side-nav__list">
        {ITEMS.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className={`side-nav__link${active === item.key ? ' side-nav__link--active' : ''}`}
              onClick={() => onSelect(item.key)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="side-nav__footer">
        {onCreateNew ? (
          <button
            type="button"
            className="side-nav__cta"
            onClick={onCreateNew}
            title="Quick find (⌘K)"
          >
            Quick find <span className="side-nav__cta-kbd">⌘K</span>
          </button>
        ) : null}
      </div>
    </aside>
  );
}
