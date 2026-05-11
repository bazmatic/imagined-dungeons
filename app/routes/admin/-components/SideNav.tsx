export type SideNavCategory = 'lore' | 'locations' | 'bestiary' | 'items' | 'characters';

export interface SideNavProps {
  readonly active: SideNavCategory;
  readonly onSelect: (c: SideNavCategory) => void;
  readonly onCreateNew?: () => void;
}

const ITEMS: ReadonlyArray<{
  readonly key: SideNavCategory;
  readonly label: string;
  readonly enabled: boolean;
}> = [
  { key: 'lore', label: 'Lore', enabled: false },
  { key: 'locations', label: 'Locations', enabled: true },
  { key: 'bestiary', label: 'Bestiary', enabled: true },
  { key: 'items', label: 'Items', enabled: false },
  { key: 'characters', label: 'Characters', enabled: false },
];

export function SideNav({ active, onSelect, onCreateNew }: SideNavProps) {
  return (
    <aside className="side-nav">
      <div className="side-nav__brand">
        <div className="side-nav__brand-name">GRIMOIRE</div>
        <div className="side-nav__brand-version">V.0.8.4-BETA</div>
      </div>
      <ul className="side-nav__list">
        {ITEMS.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className={`side-nav__link${active === item.key ? ' side-nav__link--active' : ''}${item.enabled ? '' : ' side-nav__link--disabled'}`}
              disabled={!item.enabled}
              title={item.enabled ? undefined : 'Coming soon.'}
              onClick={() => item.enabled && onSelect(item.key)}
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
