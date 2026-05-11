import { useLayoutEffect, useRef } from 'react';

export interface ManuscriptCardProps {
  readonly value: string;
  readonly onChange: (v: string) => void;
  // Kept for backwards compat until Task 12 lands; unused.
  readonly entityId?: string;
}

export function ManuscriptCard({ value, onChange }: ManuscriptCardProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Adjust height whenever value changes
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 240)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="manuscript-body-v2"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
