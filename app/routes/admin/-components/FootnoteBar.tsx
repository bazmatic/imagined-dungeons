export interface FootnoteBarProps {
  readonly wordCount: number;
  readonly charCount: number;
  readonly problemCount: number;
  readonly onDelete?: () => void;
}

export function FootnoteBar({ wordCount, charCount, problemCount, onDelete }: FootnoteBarProps) {
  return (
    <footer className="footnote-bar">
      <div className="footnote-bar__stats">
        <div className="footnote-bar__stat">
          <span className="footnote-bar__stat-label">Words</span>
          <span className="footnote-bar__stat-value">{wordCount}</span>
        </div>
        <div className="footnote-bar__stat">
          <span className="footnote-bar__stat-label">Characters</span>
          <span className="footnote-bar__stat-value">{charCount}</span>
        </div>
        <div className="footnote-bar__stat">
          <span className="footnote-bar__stat-label">Problems</span>
          <span className="footnote-bar__stat-value">{problemCount}</span>
        </div>
      </div>
      <div className="footnote-bar__actions">
        {onDelete ? (
          <button type="button" className="btn" onClick={onDelete}>
            Delete
          </button>
        ) : null}
      </div>
    </footer>
  );
}
