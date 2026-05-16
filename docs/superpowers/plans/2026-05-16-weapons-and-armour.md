# Weapons and Armour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `weaponDamage` and `armorDefense` fields to items so equipped weapons replace an attacker's bare-handed damage and equipped armour stacks on a defender's base defense.

**Architecture:** Two nullable stat columns on the `items` table. Combat resolution in `handleAttack` computes effective damage/defense by querying the attacker's and defender's equipped items before calling the pure `resolveCombat` function. Equip handler enforces a one-weapon limit. Monster spawn generates starting item rows alongside agent rows.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Vitest

---

## File Map

| File | Change |
|---|---|
| `src/infra/schema.ts` | Add `weaponDamage`, `armorDefense` nullable integer columns to `items` |
| `drizzle/0018_item_combat_stats.sql` | Migration SQL (generated) |
| `src/core/domain/entities.ts` | Add fields to `Item` interface |
| `src/core/domain/builder-types.ts` | Add to `UpsertItemInput`; add `equipped?`, `weaponDamage?`, `armorDefense?` to `InlineStarterPackEntry` |
| `src/infra/sqlite-repository.ts` | Update `toItem` mapper |
| `src/infra/builder-sqlite-repository.ts` | Update `toItem` mapper and `upsertItem` |
| `src/infra/builder-memory-repository.ts` | Update `upsertItem` |
| `src/core/builder/index.ts` | Update `asItemInput` coercion |
| `src/core/engine/actions/search.ts` | Update `coerceSpawnedItem` |
| `src/core/engine/actions/attack.ts` | Compute `effectiveDamage`/`effectiveDefense` from equipped items |
| `src/core/engine/actions/attack.test.ts` | New tests for weapon and armour effects |
| `src/core/engine/actions/equip.ts` | Auto-unequip existing weapon when equipping a new weapon |
| `src/core/engine/actions/equip.test.ts` | New tests for one-weapon enforcement |
| `src/core/spawning/expand.ts` | Return items alongside agents; enforce spawn weapon limit |
| `src/core/spawning/expand.test.ts` | New tests for startingItems spawn |
| `src/core/spawning/tick-pass.ts` | Update `SpawnBatch`, `planSpawnBatch`, `executeSpawnPlan` |
| `src/core/engine/consequences.ts` | Update `expandSpawn` call to use `.agents` / `.items` |
| `src/mcp/tools.ts` | Expose new fields in `upsert_item` and `startingItemsField` |
| `scripts/backfill-item-stats.ts` | One-shot script to set stats on existing DB items |
| *many `*.test.ts` files* | Add `weaponDamage: null, armorDefense: null` to every `Item` literal |

---

## Task 1: Schema — add columns

**Files:**
- Modify: `src/infra/schema.ts`
- Create: `drizzle/0018_item_combat_stats.sql`

- [ ] **Step 1: Add columns to schema**

In `src/infra/schema.ts`, inside the `items` table definition after `priceTag`:

```ts
// Authored stat. When non-null this item is a weapon; the value is the
// max damage die (replaces the agent's base damage stat when equipped).
weaponDamage: integer('weapon_damage'),
// Authored stat. When non-null this item is armour; the value is added
// to the defender's base defense stat while equipped.
armorDefense: integer('armor_defense'),
```

- [ ] **Step 2: Generate migration**

```bash
npx drizzle-kit generate
```

Verify `drizzle/0018_*.sql` contains:

```sql
ALTER TABLE `items` ADD `weapon_damage` integer;--> statement-breakpoint
ALTER TABLE `items` ADD `armor_defense` integer;
```

If the auto-generated name is unwanted, rename the file to `0018_item_combat_stats.sql` (update the `meta/_journal.json` entry to match).

- [ ] **Step 3: Run tests to verify nothing breaks yet**

```bash
npm run test
```

Expected: all pass (new nullable columns have no effect on existing code yet).

- [ ] **Step 4: Commit**

```bash
git add src/infra/schema.ts drizzle/
git commit -m "feat(schema): add weaponDamage and armorDefense columns to items"
```

---

## Task 2: Domain types

**Files:**
- Modify: `src/core/domain/entities.ts`
- Modify: `src/core/domain/builder-types.ts`

- [ ] **Step 1: Extend `Item` in entities.ts**

After `priceTag` in the `Item` interface:

```ts
/**
 * Authored stat. When non-null, this item is a weapon. The value is the
 * max damage die — it replaces the agent's `damage` stat while equipped.
 * null = not a weapon.
 */
readonly weaponDamage: number | null;
/**
 * Authored stat. When non-null, this item is armour. The value is added
 * to the defender's `defense` stat (stacks across all equipped armour).
 * null = not armour.
 */
readonly armorDefense: number | null;
```

- [ ] **Step 2: Extend `UpsertItemInput` in builder-types.ts**

After `priceTag` in `UpsertItemInput`:

```ts
readonly weaponDamage: number | null;
readonly armorDefense: number | null;
```

- [ ] **Step 3: Extend `InlineStarterPackEntry` in builder-types.ts**

After `hidden` in `InlineStarterPackEntry`:

```ts
/** Item spawns already worn/wielded by the monster. Default false. */
readonly equipped?: boolean;
/** Weapon stat for this spawned item. null = not a weapon. */
readonly weaponDamage?: number | null;
/** Armour stat for this spawned item. null = not armour. */
readonly armorDefense?: number | null;
```

- [ ] **Step 4: Run typecheck to find all broken callers**

```bash
npm run typecheck
```

Expected: TypeScript errors in all files that construct `Item` or `UpsertItemInput` objects. Collect the list — they'll be fixed in Task 3 and Task 4.

---

## Task 3: Update infrastructure and coercions

**Files:**
- Modify: `src/infra/sqlite-repository.ts`
- Modify: `src/infra/builder-sqlite-repository.ts`
- Modify: `src/infra/builder-memory-repository.ts`
- Modify: `src/core/builder/index.ts`
- Modify: `src/core/engine/actions/search.ts`

- [ ] **Step 1: Update `toItem` in `src/infra/sqlite-repository.ts`**

In the `toItem` function (around line 66), after `priceTag: r.priceTag`:

```ts
weaponDamage: r.weaponDamage ?? null,
armorDefense: r.armorDefense ?? null,
```

- [ ] **Step 2: Update `toItem` in `src/infra/builder-sqlite-repository.ts`**

In the `toItem` function (around line 604), after `priceTag: r.priceTag`:

```ts
weaponDamage: r.weaponDamage ?? null,
armorDefense: r.armorDefense ?? null,
```

- [ ] **Step 3: Update `upsertItem` in `src/infra/builder-sqlite-repository.ts`**

In the `upsertItem` method (around line 175), add to both the `.values({...})` and `.onConflictDoUpdate({ set: {...} })` objects:

```ts
weaponDamage: i.weaponDamage,
armorDefense: i.armorDefense,
```

- [ ] **Step 4: Update `upsertItem` in `src/infra/builder-memory-repository.ts`**

In the `upsertItem` method (around line 133), add to the `this.bucket(...).set(...)` object after `priceTag`:

```ts
weaponDamage: i.weaponDamage,
armorDefense: i.armorDefense,
```

- [ ] **Step 5: Update `asItemInput` in `src/core/builder/index.ts`**

In the `asItemInput` function (around line 400), after `priceTag: typeof i.priceTag === 'number' ? i.priceTag : null`:

```ts
weaponDamage: typeof i.weaponDamage === 'number' ? i.weaponDamage : null,
armorDefense: typeof i.armorDefense === 'number' ? i.armorDefense : null,
```

- [ ] **Step 6: Update `coerceSpawnedItem` in `src/core/engine/actions/search.ts`**

In the `coerceSpawnedItem` function (around line 69), after `priceTag: typeof raw.priceTag === 'number' ? raw.priceTag : null`:

```ts
weaponDamage: typeof raw.weaponDamage === 'number' ? raw.weaponDamage : null,
armorDefense: typeof raw.armorDefense === 'number' ? raw.armorDefense : null,
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

Expected: errors only in test files that construct `Item` literals (no new errors in src/).

---

## Task 4: Fix Item fixtures in test files

Every test file that constructs an `Item` literal (a `const x: Item = { ... }` or inline `{ ..., priceTag: null }`) needs two new fields: `weaponDamage: null, armorDefense: null`.

- [ ] **Step 1: Find all broken Item literals**

```bash
npm run typecheck 2>&1 | grep "error TS" | grep -oE "src/[^:']+" | sort -u
```

- [ ] **Step 2: Add `weaponDamage: null, armorDefense: null` to every Item literal**

The pattern: anywhere you see `priceTag: null` or `priceTag: ...` as the last field of an `Item`, add immediately after:

```ts
weaponDamage: null,
armorDefense: null,
```

Files that need this (identified from typecheck output):
- `src/core/engine/parser.test.ts`
- `src/core/engine/turn.test.ts`
- `src/core/engine/llm-prompt.test.ts`
- `src/core/engine/trade-decide.test.ts`
- `src/core/engine/consequences.test.ts`
- `src/core/engine/templates.test.ts`
- `src/core/engine/tick.test.ts`
- `src/core/engine/discovery.test.ts`
- `src/core/engine/llm-interpret.test.ts`
- `src/core/engine/parser/composite.test.ts`
- `src/core/engine/actions/creative-attack.test.ts`
- `src/core/engine/actions/look.test.ts`
- `src/core/engine/actions/buy.test.ts`
- `src/core/engine/actions/attack.test.ts` (the `sword` fixture at line ~177)
- `src/core/engine/actions/equip.test.ts` (the `cloak` fixture)
- `src/core/engine/perception.test.ts`

- [ ] **Step 3: Run typecheck to confirm zero errors**

```bash
npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 4: Run tests to confirm nothing regressed**

```bash
npm run test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -p   # stage everything touched
git commit -m "feat(items): add weaponDamage and armorDefense fields to Item"
```

---

## Task 5: Combat — effective damage and defense from equipped items

**Files:**
- Modify: `src/core/engine/actions/attack.test.ts`
- Modify: `src/core/engine/actions/attack.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/core/engine/actions/attack.test.ts`, after the existing `describe` block:

```ts
describe('handleAttack — weapon and armour stats', () => {
  const weapon = (owner: AgentId, dmg: number): Item => ({
    id: asItemId('item_sword'),
    worldId: W,
    label: 'sword',
    shortDescription: '',
    longDescription: '',
    owner: { kind: OwnerKind.Agent, id: owner },
    weight: 2,
    hidden: false,
    tags: [],
    equipped: true,
    container: false,
    opened: false,
    locked: false,
    lockedByItem: null,
    priceTag: null,
    weaponDamage: dmg,
    armorDefense: null,
  });

  const armour = (owner: AgentId, def: number): Item => ({
    id: asItemId('item_shield'),
    worldId: W,
    label: 'shield',
    shortDescription: '',
    longDescription: '',
    owner: { kind: OwnerKind.Agent, id: owner },
    weight: 5,
    hidden: false,
    tags: [],
    equipped: true,
    container: false,
    opened: false,
    locked: false,
    lockedByItem: null,
    priceTag: null,
    weaponDamage: null,
    armorDefense: def,
  });

  it('uses equipped weapon damage instead of agent base damage', async () => {
    // paff base damage = 1 (almost never hits); weapon = 50 (always hits at seed=1)
    const a = paff({ damage: 1 });
    const t = spark({ hp: 10, defense: 4 });
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [weapon(a.id, 50)],
      agents: [a, t],
      rngSeed: 1,
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    // damage=50 defense=4 → seed=1 roll 0.627 * 54 ≈ 33.9 < 50 → hit
    expect(r.value.event.outcome).toBe('hit');
    expect(r.value.event.damageDealt).toBeGreaterThan(0);
  });

  it('falls back to agent base damage when no weapon is equipped', async () => {
    // weapon in inventory but NOT equipped
    const a = paff({ damage: 50 });
    const t = spark({ hp: 10, defense: 4 });
    const unequippedSword: Item = { ...weapon(a.id, 1), equipped: false };
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [unequippedSword],
      agents: [a, t],
      rngSeed: 1,
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    // base damage=50 hits at seed=1
    expect(r.value.event.outcome).toBe('hit');
  });

  it('equipped armour raises defender effective defense', async () => {
    // attacker damage=10, target base defense=10 → threshold 0.5, seed=1 misses
    // adding armor_defense=1000 pushes threshold far lower → still miss
    const a = paff({ damage: 10 });
    const t = spark({ hp: 10, defense: 10 });
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [armour(t.id, 1000)],
      agents: [a, t],
      rngSeed: 1,
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    expect(r.value.event.outcome).toBe('miss');
  });

  it('multiple armour items stack their defense bonuses', async () => {
    const a = paff({ damage: 10 });
    const t = spark({ hp: 10, defense: 0 });
    const shield2: Item = {
      ...armour(t.id, 500),
      id: asItemId('item_shield2'),
    };
    // Two armour pieces total defense = 1000; combined with base 0 still massive
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [armour(t.id, 500), shield2],
      agents: [a, t],
      rngSeed: 1,
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    expect(r.value.event.outcome).toBe('miss');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- src/core/engine/actions/attack.test.ts
```

Expected: new tests FAIL (weapon/armour stat queries not implemented yet).

- [ ] **Step 3: Implement effective stats in `src/core/engine/actions/attack.ts`**

Add `OwnerKind` import at top:
```ts
import { AttackOutcome, EventKind, OwnerKind } from '@core/domain/kinds';
```

In `handleAttack`, replace the lines:
```ts
const combat = resolveCombat({
  attackerDamage: actor.damage,
  defenderHp: target.hp,
  defenderDefense: target.defense,
  rng,
});
```

with:

```ts
const actorItems = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: action.actorId });
const equippedWeapon = actorItems.find((i) => i.weaponDamage !== null && i.equipped);
const effectiveDamage = equippedWeapon?.weaponDamage ?? actor.damage;

const targetItems = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: action.targetAgentId });
const armorBonus = targetItems
  .filter((i) => i.armorDefense !== null && i.equipped)
  .reduce((sum, i) => sum + (i.armorDefense ?? 0), 0);
const effectiveDefense = target.defense + armorBonus;

const combat = resolveCombat({
  attackerDamage: effectiveDamage,
  defenderHp: target.hp,
  defenderDefense: effectiveDefense,
  rng,
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/core/engine/actions/attack.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full test suite**

```bash
npm run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/engine/actions/attack.ts src/core/engine/actions/attack.test.ts
git commit -m "feat(combat): use equipped weapon damage and armour defense in attack resolution"
```

---

## Task 6: Equip enforcement — one weapon at a time

**Files:**
- Modify: `src/core/engine/actions/equip.test.ts`
- Modify: `src/core/engine/actions/equip.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block to `src/core/engine/actions/equip.test.ts`:

```ts
describe('handleEquip — weapon slot enforcement', () => {
  const sword: Item = {
    id: asItemId('item_sword'),
    worldId: W,
    label: 'sword',
    shortDescription: '',
    longDescription: '',
    owner: { kind: OwnerKind.Agent, id: paff.id },
    weight: 2,
    hidden: false,
    tags: [],
    equipped: true,
    container: false,
    opened: false,
    locked: false,
    lockedByItem: null,
    priceTag: null,
    weaponDamage: 5,
    armorDefense: null,
  };
  const axe: Item = {
    id: asItemId('item_axe'),
    worldId: W,
    label: 'axe',
    shortDescription: '',
    longDescription: '',
    owner: { kind: OwnerKind.Agent, id: paff.id },
    weight: 3,
    hidden: false,
    tags: [],
    equipped: false,
    container: false,
    opened: false,
    locked: false,
    lockedByItem: null,
    priceTag: null,
    weaponDamage: 8,
    armorDefense: null,
  };
  const shield: Item = {
    id: asItemId('item_shield'),
    worldId: W,
    label: 'shield',
    shortDescription: '',
    longDescription: '',
    owner: { kind: OwnerKind.Agent, id: paff.id },
    weight: 4,
    hidden: false,
    tags: [],
    equipped: false,
    container: false,
    opened: false,
    locked: false,
    lockedByItem: null,
    priceTag: null,
    weaponDamage: null,
    armorDefense: 3,
  };

  it('auto-unequips the current weapon when equipping a new weapon', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [sword, axe],
      agents: [paff],
    });
    const r = await handleEquip(
      { kind: ActionKind.Equip, actorId: paff.id, itemId: axe.id, manner: 'draw' },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    expect((await repo.getItem(axe.id)).equipped).toBe(true);
    expect((await repo.getItem(sword.id)).equipped).toBe(false);
  });

  it('does not auto-unequip the weapon when equipping armour', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [sword, shield],
      agents: [paff],
    });
    const r = await handleEquip(
      { kind: ActionKind.Equip, actorId: paff.id, itemId: shield.id, manner: 'put on' },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    expect((await repo.getItem(shield.id)).equipped).toBe(true);
    expect((await repo.getItem(sword.id)).equipped).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- src/core/engine/actions/equip.test.ts
```

Expected: the two new tests FAIL.

- [ ] **Step 3: Implement weapon auto-unequip in `src/core/engine/actions/equip.ts`**

Add `OwnerKind` import:
```ts
import { EventKind, OwnerKind } from '@core/domain/kinds';
```

In `handleEquip`, after the `if (item.equipped)` guard (line ~29) and before `await repo.setItemEquipped(item.id, true)`, add:

```ts
if (item.weaponDamage !== null) {
  const carried = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: action.actorId });
  for (const other of carried) {
    if (other.id !== item.id && other.weaponDamage !== null && other.equipped) {
      await repo.setItemEquipped(other.id, false);
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/core/engine/actions/equip.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
npm run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/engine/actions/equip.ts src/core/engine/actions/equip.test.ts
git commit -m "feat(equip): auto-unequip existing weapon when equipping a new one"
```

---

## Task 7: Spawn starting items

**Files:**
- Modify: `src/core/spawning/expand.ts`
- Modify: `src/core/spawning/expand.test.ts`
- Modify: `src/core/spawning/tick-pass.ts`

- [ ] **Step 1: Write failing test for `expandSpawn`**

Add to `src/core/spawning/expand.test.ts`:

```ts
import { StarterPackEntryKind } from '@core/domain/builder-kinds';
import type { MonsterTemplate } from '@core/domain/builder-types';
import { asLocationId, asMonsterTemplateId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { describe, expect, it } from 'vitest';
import { expandSpawn } from './expand';

const W = asWorldId('w');
const LOC = asLocationId('loc_a');

const baseTpl = (): MonsterTemplate => ({
  id: asMonsterTemplateId('tpl_1'),
  worldId: W,
  templateKey: 'goblin',
  label: 'Goblin',
  labelPrefixInstructions: null,
  shortDescription: 'A goblin.',
  longDescription: 'A small, green creature.',
  hpMin: 5,
  hpMax: 5,
  damageMin: 2,
  damageMax: 2,
  defenseMin: 1,
  defenseMax: 1,
  mood: null,
  startingItems: [],
  tags: [],
});

describe('expandSpawn — startingItems', () => {
  it('returns no items when startingItems is empty', () => {
    const result = expandSpawn({ template: baseTpl(), locationId: LOC, count: 1 });
    expect(result.items).toHaveLength(0);
    expect(result.agents).toHaveLength(1);
  });

  it('creates a starting item owned by the spawned agent', () => {
    const tpl = baseTpl();
    (tpl.startingItems as unknown as unknown[]).push({
      kind: StarterPackEntryKind.Inline,
      label: 'rusty sword',
      shortDescription: 'A rusty sword.',
      longDescription: 'A badly maintained blade.',
      weight: 2,
      hidden: false,
      weaponDamage: 4,
      armorDefense: null,
      equipped: true,
    });
    const result = expandSpawn({ template: tpl, locationId: LOC, count: 1 });
    expect(result.agents).toHaveLength(1);
    expect(result.items).toHaveLength(1);
    const agent = result.agents[0];
    const item = result.items[0];
    expect(item.ownerKind).toBe(OwnerKind.Agent);
    expect(item.ownerId).toBe(agent.id);
    expect(item.label).toBe('rusty sword');
    expect(item.weaponDamage).toBe(4);
    expect(item.equipped).toBe(true);
  });

  it('generates one item per starting item per spawned agent', () => {
    const tpl = { ...baseTpl() };
    const items = [
      { kind: StarterPackEntryKind.Inline, label: 'sword', shortDescription: '', longDescription: '', weight: 2, hidden: false, weaponDamage: 4, armorDefense: null, equipped: true },
      { kind: StarterPackEntryKind.Inline, label: 'shield', shortDescription: '', longDescription: '', weight: 3, hidden: false, weaponDamage: null, armorDefense: 2, equipped: true },
    ];
    (tpl as { startingItems: unknown[] }).startingItems = items;
    const result = expandSpawn({ template: tpl, locationId: LOC, count: 2 });
    expect(result.agents).toHaveLength(2);
    expect(result.items).toHaveLength(4); // 2 items × 2 agents
  });

  it('enforces one-weapon limit at spawn — second weapon gets equipped:false', () => {
    const tpl = baseTpl();
    const items = [
      { kind: StarterPackEntryKind.Inline, label: 'sword', shortDescription: '', longDescription: '', weight: 2, hidden: false, weaponDamage: 4, armorDefense: null, equipped: true },
      { kind: StarterPackEntryKind.Inline, label: 'dagger', shortDescription: '', longDescription: '', weight: 1, hidden: false, weaponDamage: 2, armorDefense: null, equipped: true },
    ];
    (tpl as { startingItems: unknown[] }).startingItems = items;
    const result = expandSpawn({ template: tpl, locationId: LOC, count: 1 });
    const equippedWeapons = result.items.filter((i) => i.weaponDamage !== null && i.equipped);
    expect(equippedWeapons).toHaveLength(1);
    expect(equippedWeapons[0].label).toBe('dagger'); // last one wins
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- src/core/spawning/expand.test.ts
```

Expected: new tests FAIL (expandSpawn still returns an array, not `{ agents, items }`).

- [ ] **Step 3: Rewrite `src/core/spawning/expand.ts`**

Replace the full file content:

```ts
import type { MonsterTemplate, UpsertAgentInput, UpsertItemInput } from '@core/domain/builder-types';
import { type AgentId, type LocationId, asAgentId, asItemId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';

const newSpawnedAgentId = (templateKey: string): AgentId =>
  asAgentId(`char_${templateKey}_${Math.random().toString(36).slice(2, 10)}`);

export interface ExpandSpawnResult {
  readonly agents: readonly UpsertAgentInput[];
  readonly items: readonly UpsertItemInput[];
}

/**
 * Pure: expand a template into `count` agent + item inputs targeting
 * `locationId`. Each agent insert is mechanically identical to a hand-authored
 * agent — once the rows hit the `agents` table they're indistinguishable.
 *
 * Optional `labels` overrides per-agent label strings; falls back to
 * `template.label` when the array is shorter than `count` or omitted.
 *
 * Starting items are generated once per spawned agent. Weapon slot enforcement
 * applies: at most one weapon (item with weaponDamage != null) may have
 * equipped=true per agent — later items in the array win.
 */
export function expandSpawn(args: {
  readonly template: MonsterTemplate;
  readonly locationId: LocationId;
  readonly count: number;
  readonly labels?: readonly string[];
}): ExpandSpawnResult {
  const randInRange = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min;
  const agents: UpsertAgentInput[] = [];
  const items: UpsertItemInput[] = [];

  for (let i = 0; i < args.count; i++) {
    const hp = randInRange(args.template.hpMin, args.template.hpMax);
    const damage = randInRange(args.template.damageMin, args.template.damageMax);
    const defense = randInRange(args.template.defenseMin, args.template.defenseMax);
    const agentId = newSpawnedAgentId(args.template.templateKey);

    agents.push({
      id: agentId,
      label: args.labels?.[i] ?? args.template.label,
      shortDescription: args.template.shortDescription,
      longDescription: args.template.longDescription,
      locationId: args.locationId,
      hp,
      damage,
      defense,
      capacity: 5,
      mood: args.template.mood,
      goal: null,
      autonomous: false,
      gold: 0,
      tags: [...args.template.tags],
      secretDescription: '',
    });

    // Track whether a weapon has already been given the equipped flag for
    // this agent. The last weapon in the list with equipped:true wins.
    let equippedWeaponIdx: number | null = null;
    const agentItems: UpsertItemInput[] = [];

    for (let j = 0; j < args.template.startingItems.length; j++) {
      const entry = args.template.startingItems[j];
      const wantEquipped = entry.equipped === true;
      const isWeapon = (entry.weaponDamage ?? null) !== null;

      let equipped = wantEquipped;
      if (isWeapon && wantEquipped) {
        if (equippedWeaponIdx !== null) {
          agentItems[equippedWeaponIdx] = { ...agentItems[equippedWeaponIdx], equipped: false };
        }
        equippedWeaponIdx = agentItems.length;
      }

      agentItems.push({
        id: asItemId(`item_${(agentId as string).slice(-8)}_${j}`),
        label: entry.label,
        shortDescription: entry.shortDescription,
        longDescription: entry.longDescription,
        ownerKind: OwnerKind.Agent,
        ownerId: agentId,
        weight: entry.weight,
        hidden: entry.hidden,
        tags: [],
        container: false,
        opened: false,
        locked: false,
        lockedByItem: null,
        priceTag: null,
        weaponDamage: entry.weaponDamage ?? null,
        armorDefense: entry.armorDefense ?? null,
        equipped,
      });
    }
    items.push(...agentItems);
  }

  return { agents, items };
}
```

- [ ] **Step 4: Run expand tests**

```bash
npm run test -- src/core/spawning/expand.test.ts
```

Expected: all pass.

- [ ] **Step 5: Update `consequences.ts` — fix `expandSpawn` call**

`src/core/engine/consequences.ts` (around line 508) also calls `expandSpawn` and iterates the result as an array. After the return-type change it must use `.agents` and `.items`:

```ts
const result = expandSpawn({
  template,
  locationId: asLocationId(raw.locationId),
  count: raw.count,
});
for (const input of result.agents) {
  try {
    await lore.builderRepo.upsertAgent(lore.worldId, input);
  } catch (err) {
    log.warn(`[consequence] create_agent upsert failed: ${String(err)}`);
  }
}
for (const item of result.items) {
  try {
    await lore.builderRepo.upsertItem(lore.worldId, item);
  } catch (err) {
    log.warn(`[consequence] create_agent item upsert failed: ${String(err)}`);
  }
}
```

- [ ] **Step 7: Update `tick-pass.ts` — `SpawnBatch` and callers**

In `src/core/spawning/tick-pass.ts`:

Add `UpsertItemInput` to the import from `@core/domain/builder-types`:
```ts
import type { BuilderRepository } from '@core/builder/repository';
import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { LocationSpawnTrigger, MonsterTemplate, TriggerFireState, UpsertAgentInput, UpsertItemInput } from '@core/domain/builder-types';
```

Change `SpawnBatch`:
```ts
export interface SpawnBatch {
  readonly agents: readonly UpsertAgentInput[];
  readonly items: readonly UpsertItemInput[];
  readonly triggerFires: ReadonlyMap<SpawnTriggerId, { firedAt: number }>;
  readonly events: readonly DomainEvent[];
}
```

In `planSpawnBatch`, update the accumulators and inserts loop:

```ts
const agents: UpsertAgentInput[] = [];
const items: UpsertItemInput[] = [];
// ...
const inserts = expandSpawn({ template: tpl, locationId: hit.trigger.locationId, count, labels });
const witnesses = await args.fetchWitnesses(hit.trigger.locationId);
for (const agent of inserts.agents) {
  agents.push(agent);
  items.push(...inserts.items.filter((item) => item.ownerId === agent.id));
  events.push(spawnedEvent({
    worldId: args.worldId,
    spawnedAgentId: agent.id,
    locationId: hit.trigger.locationId,
    templateId: hit.trigger.templateId,
    ts: now(),
    witnesses,
  }));
  spawnCount++;
  if (spawnCount >= MAX_SPAWNS_PER_TICK) break;
}
```

Replace the final `return`:
```ts
return { agents, items, triggerFires, events };
```

In `executeSpawnPlan`, after `for (const agent of batch.agents)`:
```ts
for (const item of batch.items) {
  await args.builderRepo.upsertItem(args.worldId, item);
}
```

- [ ] **Step 8: Run full test suite**

```bash
npm run test
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/core/spawning/ src/core/engine/consequences.ts
git commit -m "feat(spawn): create starting items for spawned monsters"
```

---

## Task 8: MCP tool schema

**Files:**
- Modify: `src/mcp/tools.ts`

- [ ] **Step 1: Update `startingItemsField`**

In `src/mcp/tools.ts`, update `startingItemsField.items.properties` to add after `hidden`:

```ts
weaponDamage: { type: ['number', 'null'], description: 'weapon damage die (replaces agent bare-handed damage when equipped)' },
armorDefense: { type: ['number', 'null'], description: 'armor defense bonus (stacks with base defense when equipped)' },
equipped: { type: 'boolean', description: 'true if the item spawns already worn/wielded' },
```

- [ ] **Step 2: Update `upsert_item` tool**

In the `upsert_item` tool definition, add to `inputSchema.properties`:

```ts
weaponDamage: { type: ['number', 'null'], description: 'weapon damage die; null = not a weapon' },
armorDefense: { type: ['number', 'null'], description: 'armor defense bonus; null = not armor' },
```

In the `run` function for `upsert_item`, add to the input object:

```ts
weaponDamage: typeof a.weaponDamage === 'number' ? a.weaponDamage : null,
armorDefense: typeof a.armorDefense === 'number' ? a.armorDefense : null,
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools.ts
git commit -m "feat(mcp): expose weaponDamage and armorDefense in upsert_item and upsert_monster_template tools"
```

---

## Task 9: Backfill existing items in the database

**Files:**
- Create: `scripts/backfill-item-stats.ts`

This script scans existing items, identifies likely weapons and armour by label keywords, and sets reasonable stats. Run with `--dry-run` (default) to preview; run with `--apply` to commit changes.

- [ ] **Step 1: Create `scripts/backfill-item-stats.ts`**

```ts
import 'dotenv/config';
import { openDb } from '@infra/db';
import * as schema from '@infra/schema';
import { and, isNull, like, or, sql } from 'drizzle-orm';

const WEAPON_RULES: Array<{ pattern: RegExp; damage: number }> = [
  { pattern: /dagger|knife|stiletto|dirk/i, damage: 3 },
  { pattern: /sword|blade|sabre|saber|rapier/i, damage: 5 },
  { pattern: /axe|hatchet|tomahawk/i, damage: 6 },
  { pattern: /spear|lance|pike|halberd/i, damage: 5 },
  { pattern: /mace|hammer|club|flail|maul/i, damage: 4 },
  { pattern: /bow|crossbow/i, damage: 4 },
  { pattern: /staff|quarterstaff/i, damage: 3 },
  { pattern: /wand/i, damage: 2 },
  { pattern: /arrow|bolt/i, damage: 2 },
  { pattern: /weapon|sword|blade/i, damage: 4 },
];

const ARMOUR_RULES: Array<{ pattern: RegExp; defense: number }> = [
  { pattern: /buckler/i, defense: 1 },
  { pattern: /shield/i, defense: 2 },
  { pattern: /leather|gambeson|padded/i, defense: 2 },
  { pattern: /chainmail|chain mail|ringmail|ring mail|mail/i, defense: 4 },
  { pattern: /plate|breastplate|cuirass/i, defense: 6 },
  { pattern: /helmet|helm|cap/i, defense: 1 },
  { pattern: /gauntlet|vambrace|gloves/i, defense: 1 },
  { pattern: /armou?r/i, defense: 3 },
];

function detectWeaponDamage(label: string): number | null {
  for (const rule of WEAPON_RULES) {
    if (rule.pattern.test(label)) return rule.damage;
  }
  return null;
}

function detectArmorDefense(label: string): number | null {
  for (const rule of ARMOUR_RULES) {
    if (rule.pattern.test(label)) return rule.defense;
  }
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dbPath = process.env.DB_PATH ?? './imagined-dungeons.db';
  const handle = openDb(dbPath);
  const { db } = handle;

  const rows = await db.select().from(schema.items);

  let weaponCount = 0;
  let armourCount = 0;

  for (const row of rows) {
    const weaponDamage = row.weaponDamage === null ? detectWeaponDamage(row.label) : null;
    const armorDefense = row.armorDefense === null ? detectArmorDefense(row.label) : null;

    if (weaponDamage !== null) {
      console.log(`[WEAPON]  "${row.label}" (${row.id}) → weaponDamage=${weaponDamage}`);
      if (apply) {
        await db
          .update(schema.items)
          .set({ weaponDamage })
          .where(
            and(
              sql`${schema.items.id} = ${row.id}`,
              sql`${schema.items.worldId} = ${row.worldId}`,
            ),
          );
      }
      weaponCount++;
    }

    if (armorDefense !== null) {
      console.log(`[ARMOUR]  "${row.label}" (${row.id}) → armorDefense=${armorDefense}`);
      if (apply) {
        await db
          .update(schema.items)
          .set({ armorDefense })
          .where(
            and(
              sql`${schema.items.id} = ${row.id}`,
              sql`${schema.items.worldId} = ${row.worldId}`,
            ),
          );
      }
      armourCount++;
    }
  }

  handle.close();

  if (!apply) {
    console.log(`\nDry run complete. ${weaponCount} weapon(s) and ${armourCount} armour item(s) detected.`);
    console.log('Re-run with --apply to commit changes.');
  } else {
    console.log(`\nApplied: ${weaponCount} weapon(s) and ${armourCount} armour item(s) updated.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the script to package.json scripts**

In `package.json`, inside `"scripts"`:

```json
"backfill:item-stats": "tsx scripts/backfill-item-stats.ts",
```

- [ ] **Step 3: Run a dry run to review detected items**

```bash
npm run backfill:item-stats
```

Review the output. If any item is misclassified or has the wrong value, manually update it in the DB using drizzle studio (`npm run db`) or by adding a specific rule to the script before applying.

- [ ] **Step 4: Apply the stats**

```bash
npm run backfill:item-stats -- --apply
```

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-item-stats.ts package.json
git commit -m "feat(backfill): script to set weaponDamage/armorDefense on existing items"
```

---

## Final verification

- [ ] **Run full test suite and typecheck**

```bash
npm run typecheck && npm run test
```

Expected: `Found 0 errors.` and all tests pass.

- [ ] **Check git log is clean**

```bash
git log --oneline -10
```
