/**
 * Reads burning-district-data.md and emits src/infra/seed/burning-district.ts.
 * Run: `pnpm seed:gen`
 *
 * Pragmatic, not general — knows only the table layout actually present in
 * burning-district-data.md. If the source markdown changes shape, update this.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve('burning-district-data.md');
const OUT = resolve('src/infra/seed/burning-district.ts');

interface Row {
  [k: string]: string;
}

function tablesByHeading(md: string): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  const lines = md.split('\n');
  let heading = '';
  let buffer: string[] = [];
  const flush = (): void => {
    if (buffer.length < 2 || !heading) {
      buffer = [];
      return;
    }
    const headerLine = buffer[0];
    if (!headerLine) {
      buffer = [];
      return;
    }
    const head = headerLine
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    const rows = buffer.slice(2).map((line) => {
      const cells = line.split('|').map((c) => c.trim());
      const trimmed = cells[0] === '' ? cells.slice(1, -1) : cells;
      const row: Row = {};
      head.forEach((h, i) => {
        row[h] = trimmed[i] ?? '';
      });
      return row;
    });
    out[heading] = (out[heading] ?? []).concat(rows);
    buffer = [];
  };
  for (const line of lines) {
    if (line.startsWith('## ') || line.startsWith('### ') || line.startsWith('#### ')) {
      flush();
      heading = line.replace(/^#+\s*/, '').trim();
    } else if (line.startsWith('|') && line.includes('|', 1)) {
      buffer.push(line);
    } else {
      flush();
    }
  }
  flush();
  return out;
}

const backtickInner = (s: string): string => {
  const m = s.match(/`([^`]+)`/);
  return m?.[1] ?? s;
};
const stripBold = (s: string): string => s.replace(/\*\*/g, '').trim();
const boolish = (s: string): boolean => /^yes$/i.test(s.trim());
const num = (s: string, fallback = 0): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
};

const md = readFileSync(SRC, 'utf8');
const tables = tablesByHeading(md);

// Locations
const rawLocs = tables.Locations ?? [];
const locations = rawLocs.map((r) => ({
  id: backtickInner(r.ID ?? ''),
  label: r.Name ?? '',
  shortDescription: r['Short Description'] ?? '',
  longDescription: r['Long Description'] ?? '',
}));

// Exits
const rawExits = tables.Exits ?? [];
const exits = rawExits.map((r) => ({
  id: backtickInner(r.ID ?? ''),
  from: backtickInner(r.From ?? ''),
  to: backtickInner(r.To ?? ''),
  direction: (r.Direction ?? '').toLowerCase(),
  label: r.Name ?? '',
  locked: boolish(r.Locked ?? ''),
  lockedByItem: null as string | null,
}));

// Items: merge from multiple sections
const itemSections = ['Key Quest Items', 'Tools & Trinkets', "Captain Serena's Ship Items"];
const items = itemSections.flatMap((sec) =>
  (tables[sec] ?? []).map((r) => {
    const rawOwner = r['Location / Holder'] ?? r.Location ?? '';
    const ownerToken = backtickInner(rawOwner);
    const ownerKind: 'location' | 'agent' | 'item' = ownerToken.startsWith('loc_')
      ? 'location'
      : ownerToken.startsWith('char_')
        ? 'agent'
        : ownerToken.startsWith('item_')
          ? 'item'
          : 'location';
    // hidden may be in its own column (Hidden) or expressed inline
    // as "(hidden)" in the Location/Holder cell.
    const hiddenColumn = boolish(r.Hidden ?? 'No');
    const inlineHidden = /\(hidden\)/i.test(rawOwner);
    return {
      id: backtickInner(r.ID ?? ''),
      label: stripBold(r.Name ?? ''),
      shortDescription: r.Notes ?? '',
      longDescription: r.Notes ?? '',
      ownerKind,
      ownerId: ownerToken,
      weight: num(r.Weight ?? '1', 1),
      hidden: hiddenColumn || inlineHidden,
    };
  }),
);

// Agents: player + NPCs
const playerRows = tables['Player Character'] ?? [];
const npcRows = tables.NPCs ?? [];
const player = playerRows.map((r) => ({
  id: backtickInner(r.ID ?? ''),
  label: stripBold(r.Name ?? ''),
  locationId: backtickInner(r.Location ?? ''),
  hp: num(r.HP ?? '', 10),
  damage: num(r.DMG ?? '', 1),
  defense: num(r.DEF ?? '', 10),
  capacity: num(r.Capacity ?? '', 10),
  mood: null as string | null,
  goal: null as string | null,
  autonomous: false,
  shortDescription: '',
  longDescription: '',
}));

const npcs = npcRows
  .filter((r) => backtickInner(r.ID ?? '') !== 'system')
  // Lines like the row for `system` have empty location dashes — skip those too
  .filter((r) => backtickInner(r.Location ?? '').startsWith('loc_'))
  .map((r) => ({
    id: backtickInner(r.ID ?? ''),
    label: stripBold(r.Name ?? ''),
    locationId: backtickInner(r.Location ?? ''),
    hp: num(r.HP ?? '', 10),
    damage: num(r.DMG ?? '', 1),
    defense: num(r.DEF ?? '', 10),
    capacity: 10,
    mood: r.Mood || null,
    goal: r.Goal || null,
    autonomous: false,
    shortDescription: '',
    longDescription: '',
  }));

const agents = [...player, ...npcs];

const banner = '// AUTO-GENERATED by scripts/parse-world.ts. Do not edit by hand.\n';
const out = `${banner}
export const BURNING_DISTRICT = ${JSON.stringify({ locations, exits, items, agents }, null, 2)} as const;
`;

writeFileSync(OUT, out);
console.log(
  `Wrote ${OUT}: ${locations.length} locations, ${exits.length} exits, ${items.length} items, ${agents.length} agents (player=${player.length}, npcs=${npcs.length}).`,
);
