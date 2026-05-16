// src/core/engine/actions/creative-attack.ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { AttackOutcome, EventKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { type Segment, SegmentKind } from '@core/domain/segments';
import { nextEventId } from '../ids-gen';
import { perceive, type PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { makeRng, rollD } from '../rng';
import { applyDeathEffects } from './combat-effects';
import type { ActionOutcome } from './types';

export async function handleCreativeAttack(
  action: Extract<Action, { kind: 'creative_attack' }>,
  repo: HandlerRepo,
  deps?: { readonly view?: PerceptionView },
): Promise<Result<ActionOutcome, string>> {
  const view = deps?.view ?? await perceive(action.actorId, repo);
  const target = await repo.getAgent(action.targetAgentId);
  if (target.locationId !== view.location.id) {
    return Err(`${target.label} isn't here.`);
  }

  const seed = await repo.getRngSeed();
  const rng = makeRng(seed);

  const toHitRoll = rollD(rng, action.toHit.sides);
  const hit = toHitRoll >= action.toHit.threshold;
  const outcome: AttackOutcome = hit ? AttackOutcome.Hit : AttackOutcome.Miss;

  let damageDealt = 0;
  if (hit) {
    for (let i = 0; i < action.damage.count; i++) {
      damageDealt += rollD(rng, action.damage.sides);
    }
    damageDealt += action.damage.bonus;
  }

  const defenderHpAfter = target.hp - damageDealt;
  const defenderDied = hit && defenderHpAfter <= 0;

  if (hit) {
    await repo.setAgentHp(target.id, defenderHpAfter);
  }
  await repo.setRngSeed(rng.seed);

  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const worldId = await repo.getWorldId();

  if (defenderDied) {
    await applyDeathEffects(action.actorId, target, view.location.id, witnesses, worldId, repo);
  }

  const event: DomainEvent = {
    id: nextEventId(),
    worldId,
    actorId: action.actorId,
    kind: EventKind.CreativeAttack,
    witnesses,
    createdAt: new Date(),
    targetAgentId: action.targetAgentId,
    outcome,
    damageDealt,
    narrative: action.narrative,
  };

  const render: Segment[] = [];
  if (hit) {
    render.push({ kind: SegmentKind.Hit, text: `${action.narrative} (hit, ${damageDealt} dmg)` });
    if (defenderDied) {
      render.push({ kind: SegmentKind.Death, text: `${target.label} is slain!` });
    }
  } else {
    render.push({ kind: SegmentKind.Miss, text: `${action.narrative} — miss.` });
  }

  return Ok({ render, event });
}
