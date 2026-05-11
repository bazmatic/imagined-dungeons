import type { WorldTree } from '@core/domain/builder-types';
import { updateWorldCover } from '~/server/admin/worlds';
import { EntityHeader } from './EntityHeader';
import { KeyVisualPanel } from './KeyVisualPanel';
import { MetadataColumn } from './MetadataColumn';

export interface WorldSettingsFormProps {
  readonly tree: WorldTree;
  readonly onSaved: () => void;
}

export function WorldSettingsForm({ tree, onSaved }: WorldSettingsFormProps) {
  const name = tree.summary.displayName || tree.summary.label;
  return (
    <>
      <EntityHeader kindLabel="World" title={name} id={tree.summary.id as string} />
      <div className="form-grid">
        <div className="form-grid__primary">
          <p className="t-metadata" style={{ fontStyle: 'italic' }}>
            World-level settings. Cover art appears on the campaign builder and on the world's
            key-visual panel.
          </p>
        </div>
        <MetadataColumn>
          <KeyVisualPanel
            src={tree.summary.coverImageUrl}
            fallbackLetter={(name[0] ?? '?').toUpperCase()}
            editable
            onChange={async (next) => {
              await updateWorldCover({
                data: { id: tree.summary.id as string, coverImageUrl: next },
              });
              onSaved();
            }}
          />
        </MetadataColumn>
      </div>
    </>
  );
}
