import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { WorldKind } from '@core/domain/builder-kinds';

export interface VersionSwitcher {
  readonly current: WorldKind;
  readonly siblingId: string | null;
  readonly onSwitch: (siblingId: string) => void;
}

export interface TopBarProps {
  readonly activeTab: 'draft' | 'live' | 'archive';
  readonly worldName?: string;
  readonly versionSwitcher?: VersionSwitcher;
  readonly onWorldSettings?: () => void;
  readonly extra?: ReactNode;
}

export function TopBar(props: TopBarProps) {
  const { worldName, versionSwitcher, onWorldSettings } = props;
  return (
    <header className="top-bar">
      <div className="top-bar__left">
        <Link to="/admin" className="top-bar__title">
          Imagined
        </Link>
        <Link to="/admin" className="top-bar__back" title="Back to all worlds">
          ← All Worlds
        </Link>
        {worldName ? <span className="top-bar__world-name">{worldName}</span> : null}
      </div>
      <div className="top-bar__right">
        {versionSwitcher ? (
          <select
            className="top-bar__version-select"
            value={versionSwitcher.current}
            disabled={versionSwitcher.siblingId === null}
            onChange={(e) => {
              const next = e.target.value as WorldKind;
              if (next !== versionSwitcher.current && versionSwitcher.siblingId !== null) {
                versionSwitcher.onSwitch(versionSwitcher.siblingId);
              }
            }}
            title={
              versionSwitcher.siblingId === null
                ? 'No paired version exists for this world'
                : 'Switch between seed and live versions'
            }
          >
            <option value={WorldKind.Draft}>Seed Version</option>
            <option value={WorldKind.Live}>Live Version</option>
          </select>
        ) : null}
        {onWorldSettings ? (
          <button type="button" className="btn" onClick={onWorldSettings}>
            World Settings
          </button>
        ) : null}
        {props.extra}
      </div>
    </header>
  );
}
