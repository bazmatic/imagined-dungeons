import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { getInitialView } from '../server/initial-view';
import { submitCommand } from '../server/submit';

export const Route = createFileRoute('/')({
  component: Page,
  loader: async () => await getInitialView(),
});

interface Line {
  id: number;
  kind: 'system' | 'user' | 'witnessed';
  text: string;
}

function Page() {
  const initial = Route.useLoaderData();
  const [lines, setLines] = useState<Line[]>([{ id: 0, kind: 'system', text: initial.render }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll + refocus on update is the intent
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    // Only refocus if focus has been lost (e.g. after busy=true disabled the
    // input). Calling .focus() while the user is mid-keystroke can race with
    // React's render cycle and drop characters.
    if (!busy && document.activeElement !== inputRef.current) {
      inputRef.current?.focus();
    }
  }, [lines, busy]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setLines((ls) => [...ls, { id: idRef.current++, kind: 'user', text: `> ${text}` }]);
    setInput('');
    try {
      const r = await submitCommand({ data: { text } });
      setLines((ls) => {
        const next: Line[] = [...ls, { id: idRef.current++, kind: 'system', text: r.render }];
        for (const w of r.witnessed) {
          next.push({ id: idRef.current++, kind: 'witnessed', text: w });
        }
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  const colorFor = (kind: Line['kind']): string => {
    if (kind === 'user') return '#9aff9a';
    if (kind === 'witnessed') return '#888888';
    return '#cfcfcf';
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16 }}>
      <h1 style={{ fontSize: 14, opacity: 0.6, margin: '0 0 12px' }}>{initial.displayName}</h1>
      <div style={{ flex: 1, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {lines.map((l) => (
          <div
            key={l.id}
            style={{
              color: colorFor(l.kind),
              marginBottom: 8,
              fontStyle: l.kind === 'witnessed' ? 'italic' : 'normal',
            }}
          >
            {l.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <span style={{ alignSelf: 'center', color: '#9aff9a' }}>&gt;</span>
        <input
          ref={inputRef}
          // biome-ignore lint/a11y/noAutofocus: single-input game prompt — focus is the entire UX
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          style={{
            flex: 1,
            background: '#0a0a0a',
            color: '#cfcfcf',
            border: '1px solid #333',
            padding: '6px 8px',
            fontFamily: 'inherit',
          }}
          placeholder="What do you do?"
        />
      </form>
    </main>
  );
}
