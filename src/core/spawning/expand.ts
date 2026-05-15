import type { MonsterTemplate, UpsertAgentInput } from '@core/domain/builder-types';
import { type AgentId, type LocationId, asAgentId } from '@core/domain/ids';

const newSpawnedAgentId = (templateKey: string): AgentId =>
  asAgentId(`char_${templateKey}_${Math.random().toString(36).slice(2, 10)}`);

/**
 * Pure: expand a template into `count` `UpsertAgentInput`s targeting
 * `locationId`. Each insert is mechanically identical to a hand-authored
 * agent — once the rows hit the `agents` table they're indistinguishable.
 *
 * Optional `labels` overrides per-agent label strings; falls back to
 * `template.label` when the array is shorter than `count` or omitted.
 */
export function expandSpawn(args: {
  readonly template: MonsterTemplate;
  readonly locationId: LocationId;
  readonly count: number;
  readonly labels?: readonly string[];
}): readonly UpsertAgentInput[] {
  const randInRange = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min;
  const out: UpsertAgentInput[] = [];
  for (let i = 0; i < args.count; i++) {
    const hp = randInRange(args.template.hpMin, args.template.hpMax);
    const damage = randInRange(args.template.damageMin, args.template.damageMax);
    const defense = randInRange(args.template.defenseMin, args.template.defenseMax);
    out.push({
      id: newSpawnedAgentId(args.template.templateKey),
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
  }
  return out;
}
