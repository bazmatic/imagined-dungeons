import { useEffect } from 'react';

export interface FootnoteBarProps {
  readonly onDelete?: () => void;
  readonly onSave?: () => void;
  readonly saveLabel?: string;
  readonly saveDisabled?: boolean;
  readonly dirty?: boolean;
}

export function FootnoteBar({
  onDelete,
  onSave,
  saveLabel = 'Save',
  saveDisabled = false,
  dirty = false,
}: FootnoteBarProps) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return (
    <footer className="footnote-bar">
      <div className="footnote-bar__left">
        {dirty ? <span className="footnote-bar__dirty">Unsaved changes</span> : null}
      </div>
      <div className="footnote-bar__actions">
        {onDelete ? (
          <button type="button" className="btn" onClick={onDelete}>
            Delete
          </button>
        ) : null}
        {onSave ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={saveDisabled}
            onClick={onSave}
          >
            {saveLabel}
          </button>
        ) : null}
      </div>
    </footer>
  );
}
