/**
 * Seed the Burning District draft world with world lore, 15 tag-lore rows,
 * and per-location tag assignments — via the project's MCP server.
 *
 * This script spawns `pnpm mcp` as a child process, connects to it over
 * stdio using the official MCP client SDK, and invokes the lore + location
 * tools the production surface exposes. The point is to exercise the MCP
 * end-to-end rather than bypass it.
 *
 * Usage: `pnpm exec tsx scripts/seed-burning-district-lore.ts`
 *
 * Idempotent on tag name (re-runs reuse existing tag_lore row ids). Refuses
 * to run if `pnpm dev` (or another process) holds the DB open — kill it first.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const DRAFT_WORLD = 'w_draft_hyrqunaa';

const WORLD_OVERVIEW = `The City of Dinge holds a wound at its centre: the Burning District, a square mile of grand townhouses, narrow streets, and dock-quarter wharves that have been engulfed in unnatural fire for twenty years. The flames are hot but do not consume — they are alive, drifting like clouds, flaring and dying without warning. At the heart of the district stands Zezran's house, where a wizard once captured a clutch of fire-elemental hatchlings inside a gemstone called the Phoenix Heart. Their mother, an elder fire elemental, projects the burning across the district to guard their prison. The closer you get to her, the less survivable the heat: Fringe at the edges, Blaze further in, and Inferno at the centre where flesh cannot endure without protection. The Burning District is a place of scavengers, salvagers, tieflings, fire-spawned vermin, and the slow, terrible song of a grieving mother.`;

interface TagSeed {
  readonly tag: string;
  readonly title: string;
  readonly description: string;
}

const TAGS: readonly TagSeed[] = [
  // --- Region tags ---
  {
    tag: 'burning-district-street',
    title: 'Burning District street',
    description:
      'An open street within the Burning District. Cobbles are charred and ash-drifted; the timbers of abutting buildings are baked black. Dead-heat fire moves overhead like weather, flaring and dying without warning. Slaters and ash-zombies are common; visibility is bad; the air shimmers.',
  },
  {
    tag: 'burning-district-interior',
    title: 'Burning District interior',
    description:
      'An interior space within the Burning District — a workshop, camp, or sheltered ruin. Fixtures are heat-warped; surfaces are scorched but partially preserved. Inside, there is some refuge from the open flame, though the air remains uncomfortably hot and ash drifts under every door.',
  },
  {
    tag: 'burning-district-threshold',
    title: 'Burning District threshold',
    description:
      'The chokepoint between safe Dinge and the Burning District proper. Heat radiates from the District side; one wall or surface burns perpetually. Gatekeepers and tieflings manage passage; this is where adventurers buy passes, hear passwords, and steel themselves to cross.',
  },
  {
    tag: 'dockside',
    title: 'Dockside',
    description:
      "Salt-aired waterfront of the City of Dinge, away from the Burning. Wet rope, fish-scale, gull-cry, the slap of water against piling. The District's glow is visible across the rooftops at night — a reminder that the wound is never far. Captain Serena's ship the Sea Serpent is moored here under repair.",
  },
  {
    tag: 'aboard-the-serpent',
    title: 'Aboard the Sea Serpent',
    description:
      "Inside Captain Serena's moored galleon. Salt-cured wood, sea charts, the soft rocking of a hull at dock. The Serpent is a known and respected ship; its crew is diverse and capable. Captain Serena holds knowledge of routes to the Elemental Plane of Water and may aid those seeking the key to Zezran's safe.",
  },

  // --- Heat zone tags ---
  {
    tag: 'zone-fringe',
    title: 'Fringe zone',
    description:
      'The outer band of the Burning District. Heat is dangerous but survivable for short periods without protection. Fringe locations host Fire Slaters, dead-heat plants, the Fire Salvagers, and travellers who do not stray deeper. Ash zombies wander in occasionally, drawn by warmth.',
  },
  {
    tag: 'zone-blaze',
    title: 'Blaze zone',
    description:
      "The middle band of the Burning District. Fire protection is required; unprotected travellers take damage rapidly. Blaze zones host stronger elementals, the Inferno Worm, ash zombies in numbers, and the rooftop snipers. The Mother's Lullaby is often audible here.",
  },
  {
    tag: 'zone-inferno',
    title: 'Inferno zone',
    description:
      "The District's deepest band, encompassing Zezran's house and the Mother's domain. Flesh cannot survive here without specific gear: a Ring of Fire Protection, an active Fire Absorber, or equivalent magic. Only major elementals dwell here. This is where the Phoenix Heart is locked.",
  },

  // --- Faction tags ---
  {
    tag: 'faction-salvagers',
    title: 'Fire Salvagers',
    description:
      'A scavenger faction who have made a fortified encampment in a pocket of relative safety within the Fringe. They survive by scavenging from burned structures and trading what they find. Defended by Scrap Golems. Cautious of outsiders but open to trade and diplomacy.',
  },
  {
    tag: 'faction-tieflings',
    title: 'Tieflings of the Flaming Goblet',
    description:
      "The Flaming Goblet's near-entirely tiefling staff. Heat-adapted by their infernal heritage, they run the tavern, the gate, and the unofficial economy of the threshold. Charming, devilish, no-nonsense. They respect Bob Pangborn and recognise the right passwords.",
  },
  {
    tag: 'faction-zezran',
    title: "Zezran's legacy",
    description:
      "Anything tied to the wizard Zezran: his house, his workshop, his protective devices, his theories on elementals. Zezran was mortally wounded twenty years ago in the moment of the Burning, though some believe he escaped to the Plane of Fire. His name still draws Bob Pangborn's jealous wrath.",
  },
  {
    tag: 'faction-elemental',
    title: 'Elemental presence',
    description:
      "Touched by the Plane of Fire and its inhabitants: the Mother elemental, her hatchlings imprisoned in the Phoenix Heart, the Jar's still-free baby elemental, and lesser fire-creatures. Where this tag appears, the Lullaby may be heard, and the air carries a pressure beyond mere heat.",
  },

  // --- Thematic tags ---
  {
    tag: 'lullaby-resonant',
    title: 'Lullaby-resonant',
    description:
      "Places where the Mother's Lullaby is especially audible. When she sings, flames here visibly sway in time; conversation stops; the heat momentarily relents. NPCs in these places listen in silent reverence. Magical effects involving fire may behave unpredictably during the song.",
  },
  {
    tag: 'salvageable',
    title: 'Salvageable',
    description:
      'A place that rewards careful searching. Burned-out homes, ash-covered streets, ruined market stalls — anywhere fire-touched goods, coins, or curiosities might be unearthed by a `search` verb. Most finds are minor: scorched coins, fire-resistant scraps, half-melted oddments. Occasionally something significant.',
  },
  {
    tag: 'entry-controlled',
    title: 'Entry-controlled',
    description:
      "A place with a gatekeeper. Passage requires a password, a pass, payment, or persuasion. Examples: the Flaming Goblet's gate (50gp pass or daily password), the Sea Serpent's gangway. NPCs here scrutinise visitors and may refuse or delay entry.",
  },
];

interface LocationTagging {
  readonly id: string;
  readonly tags: readonly string[];
}

const LOCATION_TAGS: readonly LocationTagging[] = [
  {
    id: 'loc_flaming_goblet',
    tags: [
      'burning-district-threshold',
      'zone-fringe',
      'faction-tieflings',
      'entry-controlled',
      'lullaby-resonant',
    ],
  },
  { id: 'loc_ash_lane', tags: ['burning-district-street', 'zone-fringe', 'salvageable'] },
  { id: 'loc_burning_street', tags: ['burning-district-street', 'zone-blaze'] },
  { id: 'loc_ember_avenue', tags: ['burning-district-street', 'zone-blaze', 'salvageable'] },
  { id: 'loc_inferno_alley', tags: ['burning-district-street', 'zone-inferno'] },
  { id: 'loc_phoenix_row', tags: ['burning-district-street', 'zone-blaze', 'faction-elemental'] },
  { id: 'loc_smoldering_square', tags: ['burning-district-street', 'zone-fringe', 'salvageable'] },
  {
    id: 'loc_fire_salvagers',
    tags: ['burning-district-interior', 'zone-fringe', 'faction-salvagers'],
  },
  {
    id: 'loc_elemental_plaza',
    tags: ['burning-district-interior', 'zone-inferno', 'faction-elemental', 'lullaby-resonant'],
  },
  {
    id: 'loc_zezrans_house',
    tags: ['burning-district-interior', 'zone-inferno', 'faction-zezran'],
  },
  {
    id: 'loc_workshop',
    tags: ['burning-district-interior', 'zone-inferno', 'faction-zezran', 'lullaby-resonant'],
  },
  { id: 'loc_docks', tags: ['dockside', 'entry-controlled'] },
  { id: 'loc_dockside_markets', tags: ['dockside', 'salvageable'] },
  { id: 'loc_serenas_ship', tags: ['aboard-the-serpent', 'entry-controlled'] },
  { id: 'loc_captains_cabin', tags: ['aboard-the-serpent'] },
  { id: 'loc_crews_quarters', tags: ['aboard-the-serpent'] },
];

function randomTagLoreId(): string {
  return `tlr_${Math.random().toString(36).slice(2, 10)}`;
}

interface JsonText {
  readonly type: 'text';
  readonly text: string;
}

interface CallToolResult {
  readonly content: readonly JsonText[];
  readonly isError?: boolean;
}

async function callTool<T = unknown>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const r = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const first = r.content[0];
  if (!first) throw new Error(`${name}: empty response`);
  if (r.isError === true) throw new Error(`${name} errored: ${first.text}`);
  const parsed = JSON.parse(first.text) as unknown;
  // Tools that return a Result<T, BuilderError> have { ok: boolean, value? | error? }.
  // Read-only tools (list_*, get_*) return raw values (arrays, objects).
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'ok' in parsed &&
    typeof (parsed as { ok: unknown }).ok === 'boolean'
  ) {
    const result = parsed as { ok: boolean; value?: T; error?: { message: string } };
    if (!result.ok) throw new Error(`${name} failed: ${result.error?.message ?? first.text}`);
    return result.value as T;
  }
  return parsed as T;
}

interface ExistingTagLore {
  readonly id: string;
  readonly tag: string;
}

interface ExistingLocation {
  readonly id: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
}

interface WorldTree {
  readonly locations: readonly ExistingLocation[];
}

async function main(): Promise<void> {
  // Spawn the project's MCP server. `pnpm mcp` → `tsx src/mcp/server.ts`.
  const transport = new StdioClientTransport({
    command: 'pnpm',
    args: ['mcp'],
    // Inherit DB_PATH so the server hits the same DB as the dev runtime.
    env: { ...process.env, ...(process.env.DB_PATH ? { DB_PATH: process.env.DB_PATH } : {}) },
  });

  const client = new Client({ name: 'lore-seed-script', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  console.log('Connected to MCP server.');

  try {
    // 1. World lore
    console.log('→ update_world_lore');
    await callTool(client, 'update_world_lore', {
      id: DRAFT_WORLD,
      worldOverview: WORLD_OVERVIEW,
      storySoFar: '',
    });

    // 2. Existing tag-lore (so we can reuse ids and stay idempotent)
    console.log('→ list_tag_lore');
    const existing = await callTool<readonly ExistingTagLore[]>(client, 'list_tag_lore', {
      worldId: DRAFT_WORLD,
    });
    const byTag = new Map(existing.map((r) => [r.tag, r.id]));

    // 3. Upsert all 15 tag-lore rows
    for (const t of TAGS) {
      const id = byTag.get(t.tag) ?? randomTagLoreId();
      console.log(`→ upsert_tag_lore ${t.tag}`);
      await callTool(client, 'upsert_tag_lore', {
        worldId: DRAFT_WORLD,
        payload: { id, tag: t.tag, title: t.title, description: t.description },
      });
    }

    // 4. Read the world tree so we can preserve label/descriptions on location upserts
    console.log('→ get_world');
    const tree = await callTool<WorldTree>(client, 'get_world', { id: DRAFT_WORLD });
    const locsById = new Map(tree.locations.map((l) => [l.id, l]));

    // 5. Per-location tag assignments
    for (const lt of LOCATION_TAGS) {
      const loc = locsById.get(lt.id);
      if (!loc) {
        console.warn(`! skipped ${lt.id} (not found in draft tree)`);
        continue;
      }
      console.log(`→ upsert_location ${lt.id} [${lt.tags.join(', ')}]`);
      await callTool(client, 'upsert_location', {
        worldId: DRAFT_WORLD,
        id: lt.id,
        label: loc.label,
        shortDescription: loc.shortDescription,
        longDescription: loc.longDescription,
        tags: lt.tags,
      });
    }

    console.log('Done.');
  } finally {
    await client.close();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
