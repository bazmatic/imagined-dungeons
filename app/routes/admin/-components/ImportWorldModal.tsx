import { ImportMode, WorldExportFormat } from '@core/domain/builder-kinds';
import type { WorldExportBundle, WorldSummaryWithStats } from '@core/domain/builder-types';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { importWorldFn } from '~/server/admin/worlds';

export interface ImportWorldModalProps {
  readonly drafts: readonly WorldSummaryWithStats[];
  readonly onClose: () => void;
}

export function ImportWorldModal({ drafts, onClose }: ImportWorldModalProps) {
  const router = useRouter();
  const [bundle, setBundle] = useState<WorldExportBundle | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<typeof ImportMode.Create | typeof ImportMode.Overwrite>(
    ImportMode.Create,
  );
  const [targetDraftId, setTargetDraftId] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setBundle(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as unknown;
        if (
          typeof raw !== 'object' ||
          raw === null ||
          (raw as { format?: unknown }).format !== WorldExportFormat.Format ||
          (raw as { version?: unknown }).version !== WorldExportFormat.Version
        ) {
          setParseError('Not a valid Imagined Dungeons world export file.');
          return;
        }
        setBundle(raw as WorldExportBundle);
      } catch {
        setParseError('Could not parse file as JSON.');
      }
    };
    reader.readAsText(file);
  };

  const onImport = async (): Promise<void> => {
    if (!bundle) return;
    setImporting(true);
    setImportError(null);
    try {
      const result = await importWorldFn({
        data: {
          bundle,
          mode,
          targetDraftId: mode === ImportMode.Overwrite ? targetDraftId : undefined,
        },
      });
      if (!result.ok) {
        setImportError(result.error.message);
        return;
      }
      onClose();
      router.navigate({ to: '/admin/$worldId', params: { worldId: result.value as string } });
    } finally {
      setImporting(false);
    }
  };

  const canSubmit =
    bundle !== null &&
    !importing &&
    (mode === ImportMode.Create || (mode === ImportMode.Overwrite && targetDraftId !== ''));

  return (
    <div className="inscribe-card">
      <div className="inscribe-card__heading">Import World</div>
      <div className="inscribe-card__grid">
        <div>
          <label htmlFor="import-file" className="form-grid__field-label">
            Export file (.json)
          </label>
          <input
            id="import-file"
            type="file"
            accept=".json,application/json"
            className="manuscript-input-v2"
            onChange={onFileChange}
          />
          {parseError ? (
            <p style={{ color: 'var(--red, #c0392b)', marginTop: 4, fontSize: '0.875rem' }}>
              {parseError}
            </p>
          ) : null}
          {bundle ? (
            <p style={{ color: 'var(--parchment-dim)', marginTop: 4, fontSize: '0.875rem' }}>
              Ready: <strong>{bundle.worldMeta.displayName}</strong>
              {bundle.live ? ' (includes live world)' : ' (draft only)'}
            </p>
          ) : null}
        </div>

        <div>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="form-grid__field-label">Import as</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === ImportMode.Create}
                  onChange={() => setMode(ImportMode.Create)}
                />
                Create new world
              </label>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  cursor: drafts.length > 0 ? 'pointer' : 'not-allowed',
                  opacity: drafts.length > 0 ? 1 : 0.4,
                }}
              >
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === ImportMode.Overwrite}
                  disabled={drafts.length === 0}
                  onChange={() => setMode(ImportMode.Overwrite)}
                />
                Replace existing world
              </label>
            </div>
          </fieldset>
        </div>

        {mode === ImportMode.Overwrite ? (
          <div>
            <label htmlFor="import-target" className="form-grid__field-label">
              World to replace
            </label>
            <select
              id="import-target"
              className="manuscript-input-v2"
              value={targetDraftId}
              onChange={(e) => setTargetDraftId(e.target.value)}
            >
              <option value="">— select world —</option>
              {drafts.map((d) => (
                <option key={d.id as string} value={d.id as string}>
                  {d.displayName || d.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {importError ? (
          <p style={{ color: 'var(--red, #c0392b)', fontSize: '0.875rem' }}>{importError}</p>
        ) : null}
      </div>
      <div className="inscribe-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canSubmit}
          onClick={onImport}
        >
          {importing ? 'Importing…' : 'Import'}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
