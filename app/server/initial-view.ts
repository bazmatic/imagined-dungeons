import { runTurn } from '@core/engine/turn';
import { createServerFn } from '@tanstack/react-start';
import { PLAYER_ID, getParse, getRepo } from './world';

export const getInitialView = createServerFn({ method: 'GET' }).handler(async () => {
  const repo = await getRepo();
  const parse = getParse();
  const result = await runTurn(PLAYER_ID, 'look', repo, parse);
  return { render: result.render };
});
