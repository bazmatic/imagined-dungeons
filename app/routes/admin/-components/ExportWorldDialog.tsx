import { useState } from 'react';
import { exportWorld } from '~/server/admin/worlds';

export interface ExportWorldDialogProps {
  readonly worldId: string;
  readonly worldLabel: string;
  readonly hasLive: boolean;
  readonly onClose: () => void;
}

export function ExportWorldDialog({
  worldId,
  worldLabel,
  hasLive,
  onClose,
}: ExportWorldDialogProps) {
  const [includeLive, setIncludeLive] = useState(false);
  const [exporting, setExporting] = useState(false);

  const onExport = async (): Promise<void> => {
    setExporting(true);
    try {
      const bundle = await exportWorld({ data: { id: worldId, includeLive } });
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${worldLabel}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="inscribe-card">
      <div className="inscribe-card__heading">Export World</div>
      <div className="inscribe-card__grid">
        <div>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="form-grid__field-label">What to export</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="export-scope"
                  checked={!includeLive}
                  onChange={() => setIncludeLive(false)}
                />
                Draft only
              </label>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  cursor: hasLive ? 'pointer' : 'not-allowed',
                  opacity: hasLive ? 1 : 0.4,
                }}
              >
                <input
                  type="radio"
                  name="export-scope"
                  checked={includeLive}
                  disabled={!hasLive}
                  onChange={() => setIncludeLive(true)}
                />
                Draft + Live
              </label>
            </div>
          </fieldset>
        </div>
      </div>
      <div className="inscribe-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={exporting}
          onClick={onExport}
        >
          {exporting ? 'Exporting…' : 'Download'}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
