import { createServerFn } from '@tanstack/react-start';
import { runTurn } from '@core/engine/turn';
import { PLAYER_ID, getRepo } from './world';

export const getInitialView = createServerFn({ method: 'GET' }).handler(async () => {
  const repo = await getRepo();
  const result = await runTurn(PLAYER_ID, 'look', repo);
  return { render: result.render };
});
