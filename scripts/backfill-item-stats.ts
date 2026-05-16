/**
 * One-shot backfill: set weaponDamage and armorDefense on existing items
 * that currently have NULL in those columns, by matching label keywords.
 *
 * Idempotent: only touches rows where the column is NULL.
 * Usage (dry run):
 *   pnpm exec tsx scripts/backfill-item-stats.ts
 * Usage (apply):
 *   pnpm exec tsx scripts/backfill-item-stats.ts --apply
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { openDb } from '@infra/db';
import * as schema from '@infra/schema';

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
  { pattern: /weapon/i, damage: 4 },
];

const ARMOUR_RULES: Array<{ pattern: RegExp; defense: number }> = [
  { pattern: /buckler/i, defense: 1 },
  { pattern: /shield/i, defense: 2 },
  { pattern: /leather|gambeson|padded/i, defense: 2 },
  { pattern: /chainmail|chain mail|ringmail|ring mail|\bmail\b/i, defense: 4 },
  { pattern: /plate|breastplate|cuirass/i, defense: 6 },
  { pattern: /helmet|helm|\bcap\b/i, defense: 1 },
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

async function main(): Promise<void> {
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
          .where(and(eq(schema.items.worldId, row.worldId), eq(schema.items.id, row.id)));
      }
      weaponCount++;
    }

    if (armorDefense !== null) {
      console.log(`[ARMOUR]  "${row.label}" (${row.id}) → armorDefense=${armorDefense}`);
      if (apply) {
        await db
          .update(schema.items)
          .set({ armorDefense })
          .where(and(eq(schema.items.worldId, row.worldId), eq(schema.items.id, row.id)));
      }
      armourCount++;
    }
  }

  handle.close();

  if (!apply) {
    console.log(
      `\nDry run complete. ${weaponCount} weapon(s) and ${armourCount} armour item(s) detected.`,
    );
    console.log('Re-run with --apply to commit changes.');
  } else {
    console.log(`\nApplied: ${weaponCount} weapon(s) and ${armourCount} armour item(s) updated.`);
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
