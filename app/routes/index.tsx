import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { type Segment, SegmentKind } from '@core/domain/segments';
import { getInitialView } from '../server/initial-view';
import { submitCommand } from '../server/submit';

export const Route = createFileRoute('/')({
  component: Page,
  loader: async () => await getInitialView(),
});

type Line =
  | { id: number; kind: 'system'; segments: readonly Segment[] }
  | { id: number; kind: 'user' | 'witnessed'; text: string };

interface InventoryItem {
  id: string;
  label: string;
  equipped: boolean;
}

interface SurroundingsItem {
  id: string;
  label: string;
}

interface SurroundingsExit {
  id: string;
  direction: string;
  label: string | null;
  locked: boolean;
}

interface SurroundingsCharacter {
  id: string;
  label: string;
  shortDescription: string;
  mood: string | null;
}

interface Surroundings {
  items: readonly SurroundingsItem[];
  exits: readonly SurroundingsExit[];
  characters: readonly SurroundingsCharacter[];
}

const EMPTY_SURROUNDINGS: Surroundings = { items: [], exits: [], characters: [] };

function Page() {
  const initial = Route.useLoaderData();
  const [lines, setLines] = useState<Line[]>([{ id: 0, kind: 'system', segments: initial.render }]);
  const [inventory, setInventory] = useState<InventoryItem[]>(initial.inventory ?? []);
  const [surroundings, setSurroundings] = useState<Surroundings>(
    initial.surroundings ?? EMPTY_SURROUNDINGS,
  );
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll + refocus on update is the intent
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        const next: Line[] = [...ls, { id: idRef.current++, kind: 'system', segments: r.render }];
        for (const w of r.witnessed) {
          next.push({ id: idRef.current++, kind: 'witnessed', text: w });
        }
        return next;
      });
      if (r.inventory) setInventory(r.inventory);
      if (r.surroundings) setSurroundings(r.surroundings);
    } finally {
      setBusy(false);
    }
  }

  const colorFor = (kind: 'user' | 'witnessed'): string => {
    if (kind === 'user') return '#9aff9a';
    return '#888888';
  };

  const renderExit = (e: SurroundingsExit): string => {
    const base = e.label ? `${e.direction} (${e.label})` : e.direction;
    return e.locked ? `${base} 🔒` : base;
  };
  // (renderCharacter removed — sidebar now renders label / short / mood on separate lines.)

  const styleForSegment = (kind: SegmentKind): React.CSSProperties => {
    switch (kind) {
      case SegmentKind.LocationName:
        return { color: '#ffffff', fontSize: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 12, marginBottom: 6 };
      case SegmentKind.LocationDescription:
        return { fontStyle: 'italic', color: '#cfcfcf', borderLeft: '2px solid #333', paddingLeft: 8, marginBottom: 10 };
      case SegmentKind.Narration:
        return { fontStyle: 'italic', color: '#cfcfcf', borderLeft: '2px solid #444', paddingLeft: 8 };
      case SegmentKind.ItemList:
      case SegmentKind.CharacterList:
      case SegmentKind.ExitList:
        return { color: '#aaaaaa', fontSize: 13 };
      case SegmentKind.NoExits:
        return { color: '#666666', fontSize: 13, fontStyle: 'italic' };
      case SegmentKind.Feedback:
        return { color: '#cfcfcf', opacity: 0.8 };
      case SegmentKind.Inventory:
        return { color: '#aaaaaa', fontSize: 13, fontStyle: 'italic' };
      case SegmentKind.Spawn:
        return { color: '#ffaa44', fontWeight: 700 };
      case SegmentKind.Error:
        return { color: '#ff9999', fontWeight: 700 };
    }
  };

  const sectionHeaderStyle: React.CSSProperties = {
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
    marginBottom: 8,
  };
  const sectionWrapperStyle: React.CSSProperties = { marginBottom: 16 };
  const emptyStyle: React.CSSProperties = { opacity: 0.5, fontStyle: 'italic' };
  const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0 };
  const itemStyle: React.CSSProperties = { padding: '3px 0' };
  const subheadStyle: React.CSSProperties = {
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
    margin: '6px 0 2px',
  };
  const equippedItemStyle: React.CSSProperties = {
    padding: '3px 0',
    color: '#d8c98a',
  };
  const equippedIconStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 14,
    marginRight: 6,
    color: '#d8c98a',
    fontSize: 12,
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16 }}>
      <h1 style={{ fontSize: 14, opacity: 0.6, margin: '0 0 12px' }}>{initial.displayName}</h1>
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              paddingRight: 8,
            }}
          >
            {lines.map((l) => {
              if (l.kind === 'system') {
                return (
                  <div key={l.id} style={{ color: '#cfcfcf', marginBottom: 8 }}>
                    {l.segments.map((seg, i) => (
                      <div key={i} style={styleForSegment(seg.kind)}>{seg.text}</div>
                    ))}
                  </div>
                );
              }
              return (
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
              );
            })}
            {busy && (
              <div
                aria-label="Thinking"
                style={{
                  color: '#666',
                  fontStyle: 'italic',
                  marginBottom: 8,
                  letterSpacing: 2,
                }}
              >
                <span className="id-dot id-dot-1">·</span>
                <span className="id-dot id-dot-2">·</span>
                <span className="id-dot id-dot-3">·</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <span
              style={{
                alignSelf: 'center',
                color: '#9aff9a',
                fontSize: 22,
                lineHeight: 1,
              }}
            >
              &gt;
            </span>
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
                padding: '14px 16px',
                fontFamily: 'inherit',
                fontSize: 18,
                lineHeight: 1.4,
              }}
              placeholder="What do you do?"
            />
          </form>
        </div>
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            borderLeft: '1px solid #222',
            paddingLeft: 16,
            color: '#cfcfcf',
            fontSize: 13,
            overflowY: 'auto',
          }}
        >
          <section style={sectionWrapperStyle}>
            <div style={sectionHeaderStyle}>Here</div>
            {surroundings.items.length === 0 ? (
              <div style={emptyStyle}>(none)</div>
            ) : (
              <ul style={listStyle}>
                {surroundings.items.map((it) => (
                  <li key={it.id} style={itemStyle}>
                    {it.label}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={sectionWrapperStyle}>
            <div style={sectionHeaderStyle}>Exits</div>
            {surroundings.exits.length === 0 ? (
              <div style={emptyStyle}>(none)</div>
            ) : (
              <ul style={listStyle}>
                {surroundings.exits.map((e) => (
                  <li key={e.id} style={itemStyle}>
                    {renderExit(e)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={sectionWrapperStyle}>
            <div style={sectionHeaderStyle}>Characters</div>
            {surroundings.characters.length === 0 ? (
              <div style={emptyStyle}>(none)</div>
            ) : (
              <ul style={listStyle}>
                {surroundings.characters.map((c) => (
                  <li key={c.id} style={{ ...itemStyle, marginBottom: 8 }}>
                    <div>{c.label}</div>
                    {c.shortDescription ? (
                      <div style={{ fontStyle: 'italic', opacity: 0.85, fontSize: 12 }}>
                        {c.shortDescription}
                      </div>
                    ) : null}
                    {c.mood ? (
                      <div style={{ fontStyle: 'italic', color: '#888', fontSize: 12 }}>
                        {c.mood}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={sectionWrapperStyle}>
            <div style={sectionHeaderStyle}>Inventory</div>
            {inventory.length === 0 ? (
              <div style={emptyStyle}>(empty)</div>
            ) : (
              (() => {
                const equipped = inventory.filter((it) => it.equipped);
                const carried = inventory.filter((it) => !it.equipped);
                return (
                  <>
                    {equipped.length > 0 ? (
                      <>
                        <div style={subheadStyle}>Equipped</div>
                        <ul style={listStyle}>
                          {equipped.map((it) => (
                            <li key={it.id} style={equippedItemStyle}>
                              <span
                                style={equippedIconStyle}
                                aria-label="equipped"
                                title="Equipped"
                              >
                                ⚔
                              </span>
                              {it.label}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {carried.length > 0 ? (
                      <>
                        {equipped.length > 0 ? <div style={subheadStyle}>Carried</div> : null}
                        <ul style={listStyle}>
                          {carried.map((it) => (
                            <li key={it.id} style={itemStyle}>
                              {it.label}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </>
                );
              })()
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
