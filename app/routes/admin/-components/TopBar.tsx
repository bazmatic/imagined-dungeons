import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export interface TopBarProps {
  readonly activeTab: 'draft' | 'live' | 'archive';
  readonly showDraftChip?: boolean;
  readonly onSearch?: (q: string) => void;
  readonly onPaletteOpen?: () => void;
  readonly onPublish?: () => void;
  readonly onReset?: () => void;
  readonly publishLabel?: string;
  readonly extra?: ReactNode;
}

export function TopBar(props: TopBarProps) {
  const { activeTab, showDraftChip, onSearch, onPaletteOpen, onPublish, onReset } = props;
  return (
    <header className="top-bar">
      <div className="top-bar__left">
        <Link to="/admin" className="top-bar__title">
          Aethelgard Archive
        </Link>
        <nav className="top-bar__tabs">
          <span className={`top-bar__tab ${activeTab === 'draft' ? 'top-bar__tab--active' : ''}`}>
            Draft
          </span>
          <span className={`top-bar__tab ${activeTab === 'live' ? 'top-bar__tab--active' : ''}`}>
            Live
          </span>
          <span className={`top-bar__tab ${activeTab === 'archive' ? 'top-bar__tab--active' : ''}`}>
            Archive
          </span>
        </nav>
      </div>
      <div className="top-bar__right">
        {onSearch ? (
          <input
            type="text"
            className="top-bar__search"
            placeholder="Search archives..."
            onChange={(e) => onSearch(e.target.value)}
            onFocus={() => onPaletteOpen?.()}
          />
        ) : null}
        {showDraftChip ? <span className="top-bar__draft-chip">Draft Version</span> : null}
        {onReset ? (
          <button type="button" className="btn" onClick={onReset}>
            Reset
          </button>
        ) : null}
        {onPublish ? (
          <button type="button" className="top-bar__publish" onClick={onPublish}>
            Publish
          </button>
        ) : null}
        {props.extra}
      </div>
    </header>
  );
}
