import { ActionKind, OwnerKind } from '@core/domain/kinds';
import { asWorldId } from '@core/domain/ids';
import type { Item } from '@core/domain/entities';
import { runTurn } from '@core/engine/turn';
import { createServerFn } from '@tanstack/react-start';
import { buildSurroundings } from './surroundings';
import { getDb, getParse, getWorldContext } from './world';

export function mapInventoryItem(i: Item): { id: string; label: string; equipped: boolean } {
  return { id: i.id as string, label: i.label, equipped: i.equipped };
}

export const getInitialView = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown): string => {
    if (typeof d !== 'string') throw new Error('Expected worldId string');
    return d;
  })
  .handler(async ({ data: worldId }) => {
    const db = await getDb();
    const { repo, playerId, displayName } = await getWorldContext(db, asWorldId(worldId));
    const parse = getParse();
    const result = await runTurn(playerId, ActionKind.Look, repo, parse);
    const inventoryItems = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: playerId });
    const surroundings = await buildSurroundings(playerId, repo);
    return {
      render: result.render,
      displayName,
      inventory: inventoryItems.map(mapInventoryItem),
      surroundings,
    };
  });
