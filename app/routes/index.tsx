import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { type Segment, SegmentKind } from '@core/domain/segments';
import { TickChunkKind } from '@core/engine/tick-stream-types';
import { type TickStreamChunk } from './api/stream-command';
import { getInitialView } from '../server/initial-view';

export const Route = createFileRoute('/')({
  component: Page,
  loader: async () => await getInitialView(),
});

const LineKind = {
  System:    'system',
  User:      'user',
  Witnessed: 'witnessed',
} as const;
type LineKind = (typeof LineKind)[keyof typeof LineKind];

type Line =
  | { id: number; kind: typeof LineKind.System;                           segments: readonly Segment[] }
  | { id: number; kind: typeof LineKind.User | typeof LineKind.Witnessed; text: string };

interface InventoryItem {
  id: string;
  label: string;
  equipped: boolean;
}

interface ForSaleItem {
  readonly id: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly priceTag: number;
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
  hp: number;
  wares: readonly ForSaleItem[];
}

interface Surroundings {
  items: readonly SurroundingsItem[];
  exits: readonly SurroundingsExit[];
  characters: readonly SurroundingsCharacter[];
}

const EMPTY_SURROUNDINGS: Surroundings = { items: [], exits: [], characters: [] };

function Page() {
  const initial = Route.useLoaderData();
  const [lines, setLines] = useState<Line[]>([{ id: 0, kind: LineKind.System, segments: initial.render }]);
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
    setLines((ls) => [...ls, { id: idRef.current++, kind: LineKind.User, text: `> ${text}` }]);
    setInput('');
    try {
      const response = await fetch('/api/stream-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const SSE_PREFIX = 'data: ';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith(SSE_PREFIX)) continue;
          applyChunk(JSON.parse(line.slice(SSE_PREFIX.length)) as TickStreamChunk);
        }
      }
    } catch (err) {
      setLines((ls) => [
        ...ls,
        {
          id: idRef.current++,
          kind: LineKind.System,
          segments: [{ kind: SegmentKind.Error, text: err instanceof Error ? err.message : 'Unknown error' }],
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function applyChunk(chunk: TickStreamChunk): void {
    if (chunk.kind === TickChunkKind.PlayerTurn) {
      setLines((ls) => {
        const next: Line[] = [...ls, { id: idRef.current++, kind: LineKind.System, segments: chunk.render }];
        for (const w of chunk.witnessed) {
          next.push({ id: idRef.current++, kind: LineKind.Witnessed, text: w });
        }
        return next;
      });
    } else if (chunk.kind === TickChunkKind.NpcTurn) {
      if (chunk.witnessed.length === 0) return;
      setLines((ls) => {
        const next = [...ls];
        for (const w of chunk.witnessed) {
          next.push({ id: idRef.current++, kind: LineKind.Witnessed, text: w });
        }
        return next;
      });
    } else if (chunk.kind === TickChunkKind.Complete) {
      setInventory(chunk.inventory);
      setSurroundings(chunk.surroundings);
    } else if (chunk.kind === TickChunkKind.Error) {
      setLines((ls) => [
        ...ls,
        {
          id: idRef.current++,
          kind: LineKind.System,
          segments: [{ kind: SegmentKind.Error, text: chunk.message }],
        },
      ]);
    }
  }

  const colorFor = (kind: typeof LineKind.User | typeof LineKind.Witnessed): string => {
    if (kind === LineKind.User) return '#9aff9a';
    return '#888888';
  };

  const renderExit = (e: SurroundingsExit): string => {
    const base = e.label ? `${e.direction} (${e.label})` : e.direction;
    return e.locked ? `${base} 🔒` : base;
  };


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
      case SegmentKind.Hit:
        return { color: '#ffcc44', fontWeight: 700 };
      case SegmentKind.Miss:
        return { color: '#999999', fontStyle: 'italic' };
      case SegmentKind.Damage:
        return { color: '#ff6666' };
      case SegmentKind.Death:
        return { color: '#ff3333', fontWeight: 700, textTransform: 'uppercase' as const };
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>{initial.displayName}</h1>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: 'none',
            border: '1px solid #333',
            color: '#666',
            fontSize: 12,
            padding: '3px 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ↺ refresh
        </button>
      </div>
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
              if (l.kind === LineKind.System) {
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
                    fontStyle: l.kind === LineKind.Witnessed ? 'italic' : 'normal',
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span>{c.label}</span>
                      <span style={{ fontSize: 11, color: '#c44', marginLeft: 8, flexShrink: 0 }}>♥ {c.hp}</span>
                    </div>
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
                    {c.wares.length > 0 ? (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>For sale:</div>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {c.wares.map((w) => (
                            <li key={w.id} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 1 }}>
                              <span style={{ opacity: 0.9 }}>
                                {w.label}
                                {w.shortDescription ? (
                                  <span style={{ fontStyle: 'italic', opacity: 0.75 }}> — {w.shortDescription}</span>
                                ) : null}
                              </span>
                              <span style={{ color: '#ba9', flexShrink: 0 }}>{w.priceTag}g</span>
                            </li>
                          ))}
                        </ul>
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
