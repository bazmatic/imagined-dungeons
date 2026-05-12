import { useState } from 'react';

export interface NewWorldCardProps {
  readonly onCreate: (input: {
    readonly displayName: string;
    readonly label: string;
  }) => Promise<void>;
}

/**
 * Create-a-new-world affordance on the admin index. Submits a display name
 * and a short label; the server creates a paired scratch + live world with
 * an empty starting-state snapshot, and the new scratch is what opens in
 * the admin for authoring.
 */
export function NewWorldCard({ onCreate }: NewWorldCardProps) {
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
      <div className="inscribe-card__heading">Create New World</div>
      <div className="inscribe-card__grid">
        <div>
          <label htmlFor="new-world-name" className="form-grid__field-label">
            Display Name
          </label>
          <input
            id="new-world-name"
            type="text"
            className="manuscript-input-v2"
            placeholder="e.g. The Sunken Coast"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="new-world-label" className="form-grid__field-label">
            Short Label
          </label>
          <input
            id="new-world-label"
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
          Create world
        </button>
      </div>
    </div>
  );
}
