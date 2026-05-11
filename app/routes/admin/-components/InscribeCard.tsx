import { useState } from 'react';

export interface InscribeCardProps {
  readonly onCreate: (input: {
    readonly displayName: string;
    readonly label: string;
  }) => Promise<void>;
}

export function InscribeCard({ onCreate }: InscribeCardProps) {
  const [displayName, setDisplayName] = useState('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (): Promise<void> => {
    if (!displayName.trim() || !label.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreate({ displayName: displayName.trim(), label: label.trim() });
      setDisplayName('');
      setLabel('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="inscribe-card">
      <div className="inscribe-card__heading">Inscribe New Draft</div>
      <div className="inscribe-card__grid">
        <div>
          <label htmlFor="inscribe-name" className="form-grid__field-label">
            Entity Display Name
          </label>
          <input
            id="inscribe-name"
            type="text"
            className="manuscript-input-v2"
            placeholder="e.g. The Sunken Coast"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="inscribe-label" className="form-grid__field-label">
            World Label / Taxonomy
          </label>
          <input
            id="inscribe-label"
            type="text"
            className="manuscript-input-v2"
            placeholder="e.g. dark_fantasy_01"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </div>
      <div className="inscribe-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={submitting || !displayName.trim() || !label.trim()}
          onClick={submit}
        >
          Begin Creation
        </button>
      </div>
    </div>
  );
}
