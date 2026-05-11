import { useLayoutEffect, useRef } from 'react';

export interface ManuscriptCardProps {
  readonly entityId: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
}

export function ManuscriptCard({ entityId, value, onChange }: ManuscriptCardProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const wordCount = value.trim() === '' ? 0 : value.trim().split(/\s+/).length;

  return (
    <div className="manuscript">
      <aside className="manuscript__gutter">
        <div>ID</div>
        <div>{entityId}</div>
        <div style={{ marginTop: 16 }}>WORDS</div>
        <div>{wordCount}</div>
      </aside>
      <textarea
        ref={ref}
        className="manuscript__body"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
      />
    </div>
  );
}
