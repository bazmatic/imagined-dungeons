import { runTurn } from '@core/engine/turn';
import { createServerFn } from '@tanstack/react-start';
import { PLAYER_ID, getNarratorLlm, getParse, getRepo } from './world';

export const submitCommand = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { text?: unknown }).text !== 'string') {
      throw new Error('Expected { text: string }');
    }
    return d as { text: string };
  })
  .handler(async ({ data }) => {
    const repo = await getRepo();
    const parse = getParse();
    const llm = getNarratorLlm();
    const result = await runTurn(PLAYER_ID, data.text, repo, { parse, llm });
    return { render: result.render };
  });
