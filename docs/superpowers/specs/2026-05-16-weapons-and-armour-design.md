# Weapons and Armour Design

**Date:** 2026-05-16  
**Status:** Approved

## Overview

Add mechanical weight to equipped weapons and armour. Weapons replace an agent's bare-handed damage; armour adds to an agent's base defense. The change is minimal: two nullable stat fields on items, adjusted combat resolution, and one-weapon equip enforcement.

## Rules Summary

- **Weapon damage** replaces the agent's `damage` stat when a weapon is equipped (one at a time)
- **Armour defense** stacks additively on top of the agent's base `defense` stat (unlimited items)
- Bare-handed agents use their `damage` stat as before
- Generic items (neither stat) remain purely narrative

## Data Model

### `items` table / `Item` entity

Two new nullable fields (both default `null`):

| Field | Type | Meaning |
|---|---|---|
| `weaponDamage` | `number \| null` | Max damage die; non-null marks item as a weapon |
| `armorDefense` | `number \| null` | Defense bonus; non-null marks item as armour |

An item may have both (e.g., a spiked shield), neither (generic item), or one of each.

### `InlineStarterPackEntry` (monster template starting items)

Three new optional fields:

| Field | Type | Meaning |
|---|---|---|
| `equipped` | `boolean?` | Spawns already worn/wielded (default false) |
| `weaponDamage` | `number \| null \| undefined` | Weapon stat for spawned item |
| `armorDefense` | `number \| null \| undefined` | Armour stat for spawned item |

The MCP tool schema (`startingItemsField` in `src/mcp/tools.ts`) and `upsert_monster_template` tool must expose these fields so world-builders can author armed/armoured monsters.

## Combat Resolution

Compute two effective stats before applying the existing formula:

**Effective damage:**
```
equippedWeapon = agent's items where weaponDamage != null AND equipped = true  (at most one)
effectiveDamage = equippedWeapon?.weaponDamage ?? agent.damage
```

**Effective defense:**
```
equippedArmour = defender's items where armorDefense != null AND equipped = true
effectiveDefense = defender.defense + sum(equippedArmour.map(a => a.armorDefense))
```

These slot into the existing formula unchanged:
```
hitProbability = effectiveDamage / (effectiveDamage + effectiveDefense)
damageRoll     = rollD(rng, effectiveDamage)   →  [1..effectiveDamage]
```

No changes to hit/miss outcomes, narration, or death checks.

## Equip Enforcement

When an agent equips an item with `weaponDamage != null`:
- Any other currently equipped weapon (item with `weaponDamage != null` and `equipped = true`) belonging to that agent is automatically unequipped first.

Armour items have no such limit. Generic items (no stats) have no enforcement.

**At monster spawn:** starting items are processed in order. The same one-weapon rule applies — if multiple starting items have both `weaponDamage != null` and `equipped: true`, each successive weapon unequips the previous, leaving only the last one equipped.

## Affected Files

| File | Change |
|---|---|
| `src/infra/schema.ts` | Add `weaponDamage`, `armorDefense` columns to `items` table |
| `src/core/domain/entities.ts` | Add `weaponDamage`, `armorDefense` to `Item` type |
| `src/core/domain/builder-types.ts` | Add `equipped`, `weaponDamage`, `armorDefense` to `InlineStarterPackEntry` |
| `src/core/engine/actions/combat.ts` | Compute `effectiveDamage` and `effectiveDefense` from equipped items |
| `src/core/engine/actions/equip.ts` | Auto-unequip existing weapon when equipping a new weapon |
| `src/mcp/tools.ts` | Expose new fields in `startingItemsField` and `upsert_monster_template` |
| `src/infra/migrations/` | New migration for the two new columns |

## Out of Scope

- Weapon types (slashing, piercing, bludgeoning)
- Damage resistance or vulnerability
- Equipment slots (head, chest, hands, feet)
- Enchantments or conditional effects
- Consumables
