export interface EntityHeaderProps {
  readonly kindLabel: string;
  readonly title: string;
  readonly id?: string;
  readonly lastModified?: string;
}

export function EntityHeader({ kindLabel, title, id, lastModified }: EntityHeaderProps) {
  return (
    <header className="entity-header">
      <div>
        <div className="entity-header__eyebrow">Entity: {kindLabel}</div>
        <h1 className="entity-header__title">{title}</h1>
      </div>
      <div className="entity-header__meta">
        {id ? <div>UUID: {id}</div> : null}
        {lastModified ? <div>Last Modified: {lastModified}</div> : null}
      </div>
    </header>
  );
}
