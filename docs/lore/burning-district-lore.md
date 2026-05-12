# The Burning District — Lore

A high-level lore document derived from `scenario.md`. The first two sections are intended to be pasted (in trimmed form) into the world's **Lore** page in the admin (`World overview` and `Story so far`). The remaining sections are reference for authoring tag descriptions and entity prose.

---

## World overview

The City of Dinge holds a wound at its centre: **the Burning District**, a square mile of grand townhouses, narrow streets, and dock-quarter wharves that have been engulfed in unnatural fire for twenty years. The flames are hot but do not consume — they are alive, drifting like clouds, flaring and dying without warning. At the heart of the district stands Zezran's house, where a wizard once captured a clutch of fire-elemental hatchlings inside a gemstone called the **Phoenix Heart**. Their mother, an elder fire elemental, projects the burning across the district to guard their prison. The closer you get to her, the less survivable the heat: **Fringe** at the edges, **Blaze** further in, and **Inferno** at the centre where flesh cannot endure without protection. The Burning District is a place of scavengers, salvagers, tieflings, fire-spawned vermin, and the slow, terrible song of a grieving mother.

## Story so far

*Empty at the start of play. The consequence engine will write significant events here — major deaths, faction shifts, the fate of the Phoenix Heart, encounters with the Mother. Routine moves and conversations leave it untouched.*

---

## Cosmology and core conceit

- The fire is **dead heat**: it bakes but does not consume. Wood blackens; flesh cooks; cloth chars. It moves like weather.
- The fire is sustained by an elder fire elemental — **the Mother** — who returns from the Plane of Fire to sing to her imprisoned children. Her **Lullaby** briefly calms the flames; everyone in earshot tends to stop and listen.
- The prison: a magical safe in Zezran's workshop, holding the **Phoenix Heart** gemstone. Three depressions on the safe's top hint that the key requires three components, one of which is hidden in the Plane of Fire.
- Destroying the Phoenix Heart would free the elementals and end the burning. Bob Pangborn (Paff's uncle) wants it for himself; rival adventurer parties race for it.

## Factions and figures

- **Paff Pinkerton** — earnest, hires the player party to destroy the Heart.
- **Uncle "The Great" Bob Pangborn** — old, ill, vain. Sends rivals to seize the Heart for him.
- **Zezran** — the wizard who started it. Mortally wounded; *possibly* escaped to the Plane of Fire.
- **The Mother** — elder fire elemental. Grief, not malice.
- **Captain Serena** — tiefling sea captain at the docks, custodian of paths to the elemental Plane of Water (a clue toward the key).
- **The Fire Salvagers** — scavenger faction in a fortified encampment, defended by Scrap Golems. Will trade.
- **The Tieflings of the Flaming Goblet** — gatekeepers between safe Dinge and the District.
- **The Snipers / Bandits** — rooftop ambushers using a distressed-traveller decoy (Elysia Everwood).
- **Elysia Everwood** — elven artificer with a tragic past; bait turned ally if rescued.

## Geographic zones (heat intensity)

| Zone | What lives there | Survival |
|---|---|---|
| **Fringe** | Salvagers, slaters, dangerous fire-touched plants | Possible with care |
| **Blaze** | Stronger elementals, ash zombies, snipers | Demands protection |
| **Inferno** | The Mother, major elementals, Zezran's house | Cannot survive without specific items (Ring of Fire Protection, Fire Absorber, Frostfire equipment) |

## The threshold

- **The Flaming Goblet** is the *only* sanctioned entry — a tavern on the District's edge, one wall perpetually burning, staffed almost entirely by tieflings.
- **The Gate** is iron-doored, supervised by a bad-tempered gnome. Entry by 50gp pass or daily password.

## Notable items

- **The Phoenix Heart** — the prize. Locked in Zezran's safe.
- **The Jar** — metal sphere with triple-glazed windows holding one uncaptured hatchling. Glows brighter and "speaks" louder as it nears the Heart.
- **The Magical Safe** — three keyed depressions; one component hidden on the Plane of Fire.
- **Fire Absorber** — temporarily snuffs flames in a 10-foot radius. 3 uses/day.
- **Frostfire Bomb, Icicle Spear, Cryogenic Whip** — cold-aspect weapons effective on fire creatures.
- **Ring of Fire Protection** — staple inferno-zone gear.

## Bestiary by zone

- **Fringe:** Fire Slater (scavenger insectoid), Ash Zombie (heat-drawn, explodes on death), Salvager + Scrap Golem (faction).
- **Blaze:** Inferno Worm (gargantuan, blocks streets), Snipers (humanoid).
- **Inferno:** The Mother and her court, fire elementals of all sizes.

## Set-piece encounters

- **Tower Rescue** — civilians trapped in a burning tower; mostly an extinguish-and-extract puzzle.
- **Basement Rescue** — survivors plus a hidden chamber with treasure; a moral-priority choice.
- **Snipers** — staged ambush keyed by a "distressed traveller" decoy.
- **The Lullaby** — ambient event where the Mother sings; flames calm, NPCs stop and listen.

---

# Tag recommendations

The grouping convention is **`region-feature`** kebab-case. This pattern gives the LLM enough scaffolding to ground discovery in regional commonalities (a "dusty corner" search inside a Burning Street location should evoke ash, embers, and dead-heat plants; the same search in the Dockside Markets should evoke salt-rimed crates and rope). Recommended tags fall into four buckets:

## 1. Region / district tags (apply to multiple locations)

These signal **what kind of place you're in**. Most locations should carry exactly one of these.

| Tag | Applies to (existing locations) | Lore description focus |
|---|---|---|
| `burning-district-street` | Ash Lane, Burning Street, Ember Avenue, Inferno Alley, Phoenix Row, Smoldering Square | Charred cobbles, ash drifts, drifting flame-clouds, baked timbers. |
| `burning-district-interior` | Zezran's House, Zezran's Workshop, Fire Salvagers' Camp, Elemental Plaza | Heat-warped fixtures, shelter from the worst of the open flame, signs of the wizard or the salvagers. |
| `burning-district-threshold` | The Flaming Goblet | The tavern-and-gate, the world's choke point. Tieflings, sweat, an always-burning wall. |
| `dockside` | The Docks, Dockside Markets | Wet rope, salt rime, fish-scale, far from the heat — but the Burning glow is visible across the rooftops. |
| `aboard-the-serpent` | Captain's Cabin, Crew's Quarters, The Serpent | Salt-cured wood, charts and bilge, the rocking of a moored galleon. |

## 2. Heat-intensity tags (cross-cutting; pair with a region tag)

These signal **how survivable** the location is. They tune the narrator's prose and the discovery LLM's choice of spawns.

- `zone-fringe` — survivable; salvager-friendly; ash, slaters, dead-heat plants.
- `zone-blaze` — protection required; ash zombies, snipers, the Inferno Worm.
- `zone-inferno` — only the Mother and major elementals; instant fire damage without gear.

(For the docks/Serpent locations, no zone tag — they're outside the burning altogether.)

## 3. Faction / culture tags (apply where present)

- `faction-salvagers` — Fire Salvagers' Camp and any salvager NPC.
- `faction-tieflings` — Flaming Goblet; tiefling NPCs.
- `faction-zezran` — Zezran's House, Workshop, anything Zezran-authored.
- `faction-elemental` — Elemental Plaza, the Mother, the Jar's hatchling, the Phoenix Heart.

## 4. Thematic tags (use sparingly, for resonant locations)

- `lullaby-resonant` — places where the Mother's Lullaby is especially audible (Flaming Goblet, Elemental Plaza, the safe in Zezran's workshop).
- `salvageable` — anywhere that rewards a `search` verb with scavengable goods (most streets, the workshop).
- `entry-controlled` — the Goblet's gate, the Serpent's gangway, anywhere with a gatekeeper.

---

# Suggested mapping for the current 16 draft locations

| Location | region tag | heat tag | other tags |
|---|---|---|---|
| The Flaming Goblet | `burning-district-threshold` | `zone-fringe` | `faction-tieflings`, `entry-controlled`, `lullaby-resonant` |
| Ash Lane | `burning-district-street` | `zone-fringe` | `salvageable` |
| Burning Street | `burning-district-street` | `zone-blaze` | |
| Ember Avenue | `burning-district-street` | `zone-blaze` | `salvageable` |
| Inferno Alley | `burning-district-street` | `zone-inferno` | |
| Phoenix Row | `burning-district-street` | `zone-blaze` | `faction-elemental` |
| Smoldering Square | `burning-district-street` | `zone-fringe` | `salvageable` |
| Fire Salvagers' Camp | `burning-district-interior` | `zone-fringe` | `faction-salvagers` |
| Elemental Plaza | `burning-district-interior` | `zone-inferno` | `faction-elemental`, `lullaby-resonant` |
| Zezran's House | `burning-district-interior` | `zone-inferno` | `faction-zezran` |
| Zezran's Workshop | `burning-district-interior` | `zone-inferno` | `faction-zezran`, `lullaby-resonant` |
| The Docks | `dockside` | — | `entry-controlled` |
| Dockside Markets | `dockside` | — | `salvageable` |
| The Serpent | `aboard-the-serpent` | — | `entry-controlled` |
| Captain's Cabin | `aboard-the-serpent` | — | |
| Crew's Quarters | `aboard-the-serpent` | — | |

---

# Authoring order in the admin

1. Open `/admin/<draft>?cat=lore&sel=world` — paste **World overview** + **Story so far** placeholder.
2. `?cat=lore` → **+ New tag** → author the **region** tags first (5), then **heat** (3), then **faction** (4), then **thematic** (3). Total: 15 tags.
3. Walk each location in `?cat=locations` and attach the recommended tags.
4. Repeat for items and agents where a tag suggests a thematic fit (e.g. the Phoenix Heart gets `faction-elemental`; the Jar too; a Scrap Golem template gets `faction-salvagers`).
