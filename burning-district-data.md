# The Burning District — Adventure Data

A reference document for the AI-powered text adventure "The Burning District," a fantasy setting where magical flames consume an area of a coastal city.

---

## Locations

| ID | Name | Short Description | Long Description | Notes |
|---|---|---|---|---|
| `loc_flaming_goblet` | The Flaming Goblet | A tavern on the edge of the Burning District | A tavern with one wall constantly aflame, mostly staffed by Tieflings. The heat inside is intense. | Occasionally, in the distance, the mournful song of the Mother Fire Elemental can be heard. |
| `loc_burning_street` | Burning Street | A street engulfed in perpetual flames | Once a bustling street, now consumed by magical fire that cannot be extinguished. | Fire Slaters and Ash Zombies are known to roam this area. |
| `loc_fire_salvagers` | Fire Salvagers' Camp | A makeshift camp of scavengers | A settlement of survivors who have adapted to life in the Burning District, trading in salvaged goods. | — |
| `loc_zezrans_house` | Zezran's House | A partially burned wizard's house | The former residence of the wizard Zezran, now a dangerous ruin with flames licking at its walls. | Ash Zombies occasionally wander through the ruins. |
| `loc_workshop` | Zezran's Workshop | A cluttered magical workshop | The heart of Zezran's experiments, filled with arcane equipment and magical artifacts. | — |
| `loc_inferno_alley` | Inferno Alley | A narrow alley of intense heat | A tight passage where the flames burn hottest, challenging even the most fire-resistant adventurers. | Fire Slaters thrive in the intense heat of this alley. |
| `loc_elemental_plaza` | Elemental Plaza | A wide open area with a fire elemental | A former city square now dominated by a massive fire elemental, believed to be the mother of the trapped elementals. | Fire Slaters can often be found scurrying around the plaza. |
| `loc_ember_avenue` | Ember Avenue | A wide street with floating embers | A broad avenue where glowing embers float through the air like fireflies, creating a beautiful yet dangerous spectacle. | Fire Slaters are commonly seen darting between the floating embers. |
| `loc_ash_lane` | Ash Lane | A street covered in deep ash | A narrow lane where ash has accumulated to knee-depth, making movement difficult and hiding potential dangers. | Both Fire Slaters and Ash Zombies are frequently encountered here, hidden in the deep ash. |
| `loc_phoenix_row` | Phoenix Row | A street of colorful, flickering flames | A street where flames dance in vibrant colors reminiscent of a phoenix's plumage, constantly dying and being reborn. | Ash Zombies occasionally shamble through, drawn by the vibrant flames. |
| `loc_smoldering_square` | Smoldering Square | An open area with smoldering ruins | A once-bustling marketplace, now a large square filled with the smoldering remains of stalls and buildings. | Fire Slaters and Ash Zombies are common sights among the smoldering ruins. |
| `loc_dockside_markets` | Dockside Markets | A bustling marketplace near the docks | A lively area where traders and sailors mingle, selling goods from distant lands. The smell of salt and spices fills the air. | — |
| `loc_docks` | The Docks | A series of wooden piers extending into the water | Wooden piers stretch out into the water, where ships of various sizes are moored. Captain Serena's crew can be seen patrolling near their ship, eyeing strangers suspiciously. | Captain Serena's crew will spawn here (`template_serena_crew`) and will threaten or attack anyone who approaches their ship without Serena present. |
| `loc_serenas_ship` | The Serpent | Captain Serena's impressive ship | A sleek vessel with intricate carvings of serpents along its hull. Currently undergoing repairs, but still looks formidable. | The crew is fiercely loyal to Captain Serena and will attack intruders unless accompanied by her. |
| `loc_captains_cabin` | Captain's Cabin | Captain Serena's private quarters | A luxurious cabin filled with maps, navigational instruments, and exotic treasures. The air is heavy with the scent of spices and sea salt. | Crew will immediately spawn and attack any intruders unless accompanied by Captain Serena. |
| `loc_crews_quarters` | Crew's Quarters | The living space for Captain Serena's crew | A cramped area below deck filled with hammocks, personal belongings, and the strong smell of unwashed sailors. | Crew will immediately spawn and attack any intruders unless accompanied by Captain Serena. |

---

## Exits

| ID | From | Direction | To | Name | Locked | Notes |
|---|---|---|---|---|---|---|
| `exit_to_street` | `loc_flaming_goblet` | north | `loc_burning_street` | Tavern Back Door | Yes | Requires Rusty Key (`item_rusty_key`) to unlock. |
| `exit_to_tavern` | `loc_burning_street` | south | `loc_flaming_goblet` | Tavern Back Entrance | No | — |
| `exit_to_markets` | `loc_flaming_goblet` | south | `loc_dockside_markets` | Tavern Front Door | No | — |
| `exit_to_tavern_from_markets` | `loc_dockside_markets` | north | `loc_flaming_goblet` | Tavern Front Entrance | No | — |
| `exit_to_camp` | `loc_burning_street` | east | `loc_fire_salvagers` | Path to Salvagers' Camp | No | — |
| `exit_to_house` | `loc_burning_street` | west | `loc_zezrans_house` | Zezran's House | No | — |
| `exit_to_workshop` | `loc_zezrans_house` | down | `loc_workshop` | Hidden Passage | Yes | Opens by solving the flame puzzle on the floor. |
| `exit_to_alley` | `loc_burning_street` | north | `loc_inferno_alley` | Narrow Alleyway | No | — |
| `exit_to_plaza` | `loc_inferno_alley` | east | `loc_elemental_plaza` | Wide Street | Yes | Blocked by a wall of fire. Requires Magical Fire Extinguisher (`item_fire_extinguisher`). |
| `exit_to_ember` | `loc_burning_street` | northeast | `loc_ember_avenue` | Glowing Archway | No | — |
| `exit_to_ash` | `loc_ember_avenue` | east | `loc_ash_lane` | Ashen Path | No | — |
| `exit_to_phoenix` | `loc_ash_lane` | south | `loc_phoenix_row` | Colorful Flames | No | — |
| `exit_to_square` | `loc_phoenix_row` | west | `loc_smoldering_square` | Crumbling Archway | No | — |
| `exit_to_burning` | `loc_smoldering_square` | north | `loc_burning_street` | Flame-Licked Street | No | — |
| `exit_to_docks` | `loc_dockside_markets` | east | `loc_docks` | Path to Docks | No | — |
| `exit_to_markets_from_docks` | `loc_docks` | west | `loc_dockside_markets` | Path to Markets | No | — |
| `exit_to_serenas_ship` | `loc_docks` | south | `loc_serenas_ship` | Gangplank to The Serpent | No | — |
| `exit_to_docks_from_ship` | `loc_serenas_ship` | north | `loc_docks` | Gangplank to Docks | No | — |
| `exit_to_burning_from_camp` | `loc_fire_salvagers` | west | `loc_burning_street` | Camp Exit | No | — |
| `exit_to_burning_from_house` | `loc_zezrans_house` | east | `loc_burning_street` | House Entrance | No | — |
| `exit_to_house_from_workshop` | `loc_workshop` | up | `loc_zezrans_house` | Workshop Up | No | — |
| `exit_to_burning_from_alley` | `loc_inferno_alley` | south | `loc_burning_street` | Alley Exit | No | — |
| `exit_to_alley_from_plaza` | `loc_elemental_plaza` | west | `loc_inferno_alley` | Plaza Exit | No | — |
| `exit_to_burning_from_ember` | `loc_ember_avenue` | southwest | `loc_burning_street` | Ember Avenue Exit | No | — |
| `exit_to_ember_from_ash` | `loc_ash_lane` | west | `loc_ember_avenue` | Ash Lane Exit | No | — |
| `exit_to_ash_from_phoenix` | `loc_phoenix_row` | north | `loc_ash_lane` | Phoenix Row Exit | No | — |
| `exit_to_phoenix_from_square` | `loc_smoldering_square` | east | `loc_phoenix_row` | Smoldering Square Exit | No | — |
| `exit_to_captains_cabin` | `loc_serenas_ship` | south | `loc_captains_cabin` | Captain's Cabin Door | No | — |
| `exit_to_ship_from_cabin` | `loc_captains_cabin` | north | `loc_serenas_ship` | Cabin Exit | No | — |
| `exit_to_crews_quarters` | `loc_serenas_ship` | down | `loc_crews_quarters` | Hatch to Crew's Quarters | No | — |
| `exit_to_ship_from_quarters` | `loc_crews_quarters` | up | `loc_serenas_ship` | Ladder to Deck | No | — |

---

## Characters (Agents)

### Player Character

| ID | Name | Location | HP | DMG | DEF | Capacity |
|---|---|---|---|---|---|---|
| `char_39322` | **Paff Pinkerton** | `loc_flaming_goblet` | 20 | 2 | 12 | 30 |

> *Determined* — A youth with a fierce determination in his eyes. Nephew of the wizard Bob, he believes his uncle was involved in creating the Burning District and seeks to stop the eternal fire.
> **Goal:** Discover the truth about the Phoenix Heart.

### NPCs

| ID | Name | Location | Mood | HP | DMG | DEF | Goal |
|---|---|---|---|---|---|---|---|
| `system` | System | — | — | 0 | 0 | 0 | Referee for the game |
| `char_84751` | **Captain Serena** | `loc_serenas_ship` | Cautious | 25 | 3 | 14 | Return to the sea |
| `char_62103` | **Uncle Bob** | `loc_burning_street` | Anxious | 18 | 4 | 13 | Obtain the Phoenix Heart for himself |
| `char_15987` | **Elysia Everwood** | `loc_fire_salvagers` | Desperate | 22 | 2 | 13 | Redeem herself and restore her family's honor |
| `char_70451` | **Ember** | `loc_ember_avenue` | Playful | 15 | 2 | 16 | Spread chaos and laughter |
| `char_28934` | **Ashen** | `loc_ash_lane` | Melancholy | 35 | 4 | 15 | Preserve the history of the district |
| `char_53679` | **Flicker** | `loc_phoenix_row` | Anxious | 20 | 2 | 14 | Find a way to control the district's flames |
| `char_91245` | **Cinder** | `loc_smoldering_square` | Determined | 28 | 3 | 14 | Rebuild a new community from the ashes |
| `char_47802` | **Pyra** | `loc_elemental_plaza` | Intense | 24 | 4 | 15 | Harness the power of the Burning District |
| `char_36510` | **Smolder** | `loc_burning_street` | Pessimistic | 26 | 3 | 13 | Find a way to escape the Burning District |
| `char_82367` | **Ash Pup** | `loc_ash_lane` | Curious | 12 | 1 | 15 | Find interesting objects buried in the ash |
| `char_59731` | **Inferna** | `loc_elemental_plaza` | Protective | 60 | 6 | 18 | Free her children from the Phoenix Heart |
| `char_13498` | **Spark** | `loc_flaming_goblet` | Energetic | 18 | 2 | 14 | Map out all safe routes in the district |
| `char_75024` | **Cinder Golem** | `loc_smoldering_square` | Stoic | 45 | 5 | 16 | Protect the fire salvagers |
| `char_20876` | **Flamebeak** | `loc_phoenix_row` | Majestic | 30 | 3 | 17 | Inspire hope in the district's inhabitants |

#### Backstories

- **Captain Serena** — A tall tiefling with red skin and sharp horns, wearing a coat of fish scales. Veteran sailor whose ship is undergoing repairs. Has valuable information about Zezran and the elemental plane of water.
- **Uncle Bob** — Cantankerous old man in a singed wizard's robe. Former colleague of Zezran, involved in creating the Phoenix Heart and the subsequent burning of the district. Hides a guilty secret.
- **Elysia Everwood** — Elf with a haunted look, clothes singed and tattered. Last of a renowned elven family, seeking to clear her name.
- **Ember** — Small flickering humanoid of living flame. Born from the magical fires; loves tricks and misdirection.
- **Ashen** — Humanoid of tightly packed ash with glowing ember eyes. Mourns the lost city.
- **Flicker** — Lithe human with hair that shifts between shades of red and orange. Performer with unique fire manipulation.
- **Cinder** — Stocky dwarf with soot-stained skin and a smoldering beard. Former smith, now leads salvagers.
- **Pyra** — Tall woman with fiery red hair and flickering eyes. Powerful pyromancer.
- **Smolder** — Muscular human with burn scars and tattered firefighter gear. Believes the district is beyond saving.
- **Ash Pup** — Small dog-like creature of ash and embers, Ashen's loyal companion.
- **Inferna** — Massive majestic fire elemental, mother of the trapped elementals. Guards the Phoenix Heart.
- **Spark** — Young halfling with hair that crackles with static electricity. Swift messenger.
- **Cinder Golem** — Large humanoid of compressed ash and burning embers, created by Cinder.
- **Flamebeak** — Magnificent bird with feathers of dancing flames. Symbol of hope.

---

## Items

### Key Quest Items

| ID | Name | Location / Holder | Notes |
|---|---|---|---|
| `item_phoenix_heart` | **The Phoenix Heart** | `loc_workshop` | Source of the district's eternal flames. Pyra (`char_47802`) desperately wants it. |
| `item_rusty_key` | Rusty Key | inside `item_wooden_box` | Opens the back door of the Flaming Goblet. |
| `item_wooden_box` | Wooden Box | `loc_flaming_goblet` (hidden) | Contains the Rusty Key. |
| `item_fire_extinguisher` | Magical Fire Extinguisher | held by `char_39322` (Paff) | Uncle Bob (`char_62103`) is terrified of this and will flee if he sees it. |
| `item_zezrans_journal` | Zezran's Journal | `loc_zezrans_house` | Crucial info about the Phoenix Heart's creation and weaknesses. |
| `item_frostfire_bomb` | Frostfire Bomb | `loc_fire_salvagers` | Extremely effective against Inferna (`char_59731`). |
| `item_flame_tongs` | Flame Tongs | held by `char_91245` (Cinder) | Can safely handle the Phoenix Heart. |
| `item_elemental_jar` | Elemental Containment Jar | `loc_workshop` | Can capture Ember (`char_70451`) or other small fire elementals. |

### Tools & Trinkets

| ID | Name | Location / Holder | Weight | Notes |
|---|---|---|---|---|
| `item_ashen_chronicle` | Ashen Chronicle | held by `char_28934` (Ashen) | 2 | Records memories of those who touch it. |
| `item_cinder_coins` | Cinder Coins | `loc_smoldering_square` | 1 | Currency of the Burning District. |
| `item_ember_whistle` | Ember Whistle | held by `char_70451` (Ember) | 1 | Commands nearby embers and small flames. |
| `item_fire_map` | Fire Map | `loc_flaming_goblet` | 1 | Real-time map of fires in the district. |
| `item_heat_cloak` | Heat-Resistant Cloak | `loc_fire_salvagers` | 2 | Protects against extreme heat. |
| `item_phoenix_feather` | Phoenix Feather | `loc_phoenix_row` | 1 | Inferna is drawn to it. |

### Captain Serena's Ship Items

| ID | Name | Location | Hidden | Notes |
|---|---|---|---|---|
| `item_captains_log` | Captain's Log | `loc_captains_cabin` | No | Info about Serena's encounters with water elementals. |
| `item_treasure_map` | Mysterious Map | `loc_captains_cabin` | Yes | Hidden in a secret compartment in Serena's desk. |
| `item_spyglass` | Enchanted Spyglass | `loc_captains_cabin` | No | Sees through magical illusions. |
| `item_lucky_coin` | Lucky Silver Coin | `loc_crews_quarters` | No | Believed to protect the ship. |
| `item_smuggled_goods` | Smuggled Goods | `loc_crews_quarters` | Yes | Hidden under a loose floorboard. |
| `item_crew_manifest` | Crew Manifest | `loc_crews_quarters` | No | List of crew members and roles. |

---

## Monsters & Spawnable Creatures

### Creature Templates

| ID | Name | HP | DMG | DEF | Mood | Goal |
|---|---|---|---|---|---|---|
| `template_serena_crew` | Serena's Crewmate | 15 | 3 | 12 | Suspicious | Protect the ship; follow Serena's orders |
| `template_fire_slater` | Fire Slater | 10 | 2 | 15 | Aggressive | Consume heat and organic matter |
| `template_ash_zombie` | Ash Zombie | 20 | 3 | 10 | Hostile | Spread the burning curse |

#### Behavior Notes

- **Serena's Crewmate** — A weathered sailor with a fierce look, armed with a cutlass. Hostile to strangers approaching the ship without Serena present. Will attack without warning.
- **Fire Slater** — A small isopod-like creature with a glowing red carapace radiating heat. Native to the Elemental Plane of Fire. Highly aggressive; can squeeze through tight spaces and emit bursts of heat.
- **Ash Zombie** — A humanoid of compacted ash and embers, moving with jerky motions. Reanimated remains of those who perished in the initial burning. Crumbles easily but reforms unless completely dispersed. **Vulnerable to water.**

### Spawn Locations

| Template | Location | Spawn Chance |
|---|---|---|
| Serena's Crewmate | `loc_serenas_ship` | 1.0 |
| Serena's Crewmate | `loc_captains_cabin` | 1.0 |
| Serena's Crewmate | `loc_crews_quarters` | 1.0 |
| Serena's Crewmate | `loc_docks` | 0.8 |
| Serena's Crewmate | `loc_dockside_markets` | 0.3 |
| Fire Slater | `loc_inferno_alley` | 0.9 |
| Fire Slater | `loc_ember_avenue` | 0.8 |
| Fire Slater | `loc_ash_lane` | 0.7 |
| Fire Slater | `loc_smoldering_square` | 0.7 |
| Fire Slater | `loc_burning_street` | 0.6 |
| Fire Slater | `loc_elemental_plaza` | 0.5 |
| Ash Zombie | `loc_ash_lane` | 0.8 |
| Ash Zombie | `loc_smoldering_square` | 0.6 |
| Ash Zombie | `loc_burning_street` | 0.5 |
| Ash Zombie | `loc_zezrans_house` | 0.4 |
| Ash Zombie | `loc_phoenix_row` | 0.3 |

---

## Map Overview

```
                   loc_inferno_alley ──east── loc_elemental_plaza
                          │                          (Inferna)
                         north
                          │
loc_zezrans_house ──east── loc_burning_street ──east── loc_fire_salvagers
        │                  │ │ │
       down               NE  N  S
        │                  │ │ │
loc_workshop      loc_ember_avenue
                          │
                         east
                          │
                    loc_ash_lane ──south── loc_phoenix_row ──west── loc_smoldering_square
                                                                            │
                                                                          north
                                                                            │
                                                                  (back to loc_burning_street)

loc_flaming_goblet ──south── loc_dockside_markets ──east── loc_docks ──south── loc_serenas_ship
                                                                                       │
                                                                                south / down
                                                                                       │
                                                                          loc_captains_cabin
                                                                          loc_crews_quarters
```
