export type SideNavCategory = 'locations' | 'bestiary' | 'agents' | 'items' | 'lore';

export interface SideNavProps {
  readonly active: SideNavCategory;
  readonly onSelect: (c: SideNavCategory) => void;
  readonly onCreateNew?: () => void;
}

const ITEMS: ReadonlyArray<{
  readonly key: SideNavCategory;
  readonly label: string;
}> = [
  { key: 'locations', label: 'Locations' },
  { key: 'bestiary', label: 'Bestiary' },
  { key: 'agents', label: 'Agents' },
  { key: 'items', label: 'Items' },
  { key: 'lore', label: 'Lore' },
];

export function SideNav({ active, onSelect, onCreateNew }: SideNavProps) {
  return (
    <aside className="side-nav">
      <div className="side-nav__brand">
        <div className="side-nav__brand-name">Imagined Builder</div>
        <div className="side-nav__brand-version">BETA</div>
      </div>
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
          <button type="button" className="side-nav__cta" onClick={onCreateNew}>
            Create new entity
          </button>
        ) : null}
      </div>
    </aside>
  );
}
