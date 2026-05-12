import { OwnerKind } from '@core/domain/kinds';
import { runTurn } from '@core/engine/turn';
import { createServerFn } from '@tanstack/react-start';
import { buildSurroundings } from './surroundings';
import { DISPLAY_NAME, PLAYER_ID, getParse, getRepo } from './world';

export const getInitialView = createServerFn({ method: 'GET' }).handler(async () => {
  const repo = await getRepo();
  const parse = getParse();
  const result = await runTurn(PLAYER_ID, 'look', repo, parse);
  const inventoryItems = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: PLAYER_ID });
  const surroundings = await buildSurroundings(PLAYER_ID, repo);
  return {
    render: result.render,
    displayName: DISPLAY_NAME,
    inventory: inventoryItems.map((i) => ({
      id: i.id as string,
      label: i.label,
      equipped: i.equipped,
    })),
    surroundings,
  };
});
