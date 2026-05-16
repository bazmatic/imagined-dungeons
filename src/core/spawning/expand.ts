import { StarterPackEntryKind } from '@core/domain/builder-kinds';
import type { UpsertAgentInput, UpsertItemInput } from '@core/domain/builder-types';
import type { MonsterTemplate } from '@core/domain/builder-types';
import { type AgentId, type ItemId, type LocationId, asAgentId, asItemId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';

export interface ExpandSpawnResult {
  readonly agents: readonly UpsertAgentInput[];
  readonly items: readonly UpsertItemInput[];
}

const newSpawnedAgentId = (templateKey: string): AgentId =>
  asAgentId(`char_${templateKey}_${Math.random().toString(36).slice(2, 10)}`);

/**
 * Pure: expand a template into `count` `UpsertAgentInput`s targeting
 * `locationId`, plus any starting items defined on the template. Each
 * insert is mechanically identical to a hand-authored agent — once the
 * rows hit the tables they're indistinguishable.
 *
 * Optional `labels` overrides per-agent label strings; falls back to
 * `template.label` when the array is shorter than `count` or omitted.
 *
 * Starting items: one item per `startingItems` entry per spawned agent.
 * Only `StarterPackEntryKind.Inline` entries are processed. One-weapon
 * limit is enforced per agent: if a second weapon with `equipped: true`
 * is added, the previously-equipped weapon is set to `equipped: false`
 * (last weapon wins).
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

    // Generate starting items for this agent.
    const agentItems: { item: UpsertItemInput; idx: number }[] = [];
    // Track index of the currently-equipped weapon so we can un-equip it
    // when a later weapon also requests equipped: true.
    let equippedWeaponIdx: number | null = null;

    let j = 0;
    for (const entry of args.template.startingItems) {
      if (entry.kind !== StarterPackEntryKind.Inline) {
        j++;
        continue;
      }
      const itemId: ItemId = asItemId(`item_${(agentId as string).slice(-8)}_${j}`);
      const isWeapon = (entry.weaponDamage ?? null) !== null;
      let equipped = entry.equipped ?? false;

      if (isWeapon && equipped) {
        if (equippedWeaponIdx !== null) {
          // Un-equip the previously-equipped weapon.
          const prev = agentItems[equippedWeaponIdx];
          if (prev) {
            agentItems[equippedWeaponIdx] = {
              ...prev,
              item: { ...prev.item, equipped: false },
            };
          }
        }
        equippedWeaponIdx = agentItems.length;
      }

      agentItems.push({
        item: {
          id: itemId,
          label: entry.label,
          shortDescription: entry.shortDescription,
          longDescription: entry.longDescription,
          ownerKind: OwnerKind.Agent,
          ownerId: agentId as string,
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
        },
        idx: j,
      });
      j++;
    }

    for (const { item } of agentItems) {
      items.push(item);
    }
  }

  return { agents, items };
}
