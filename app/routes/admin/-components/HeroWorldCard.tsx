import type { WorldSummaryWithStats } from '@core/domain/builder-types';
import { Link } from '@tanstack/react-router';
import { WorldStats } from './WorldStats';

export interface HeroWorldCardProps {
  readonly world: WorldSummaryWithStats;
}

export function HeroWorldCard({ world }: HeroWorldCardProps) {
  const name = world.displayName || world.label;
  const initial = (name[0] ?? '?').toUpperCase();
  return (
    <article className="hero-card">
      <div className="hero-card__image-wrap">
        {world.coverImageUrl ? (
          <img className="hero-card__image" src={world.coverImageUrl} alt="" />
        ) : (
          <div className="hero-card__placeholder">
            <span className="hero-card__placeholder-glyph">{initial}</span>
          </div>
        )}
        <div className="hero-card__overlay" />
        <span className="hero-card__sync-pill">Synchronized</span>
      </div>
      <div className="hero-card__body">
        <div>
          <h3 className="hero-card__name">{name}</h3>
          <p className="hero-card__sub">{world.label}</p>
        </div>
        <WorldStats
          locationCount={world.locationCount}
          agentCount={world.agentCount}
          itemCount={world.itemCount}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="t-data-sm" style={{ color: 'var(--parchment-dim)' }}>
            ID: {world.id as string}
          </span>
          <Link
            to="/admin/$worldId"
            params={{ worldId: world.id as string }}
            search={{ cat: 'locations' as const }}
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            Enter Archive
          </Link>
        </div>
      </div>
    </article>
  );
}
