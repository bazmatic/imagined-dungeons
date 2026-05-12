import { expect, it } from 'vitest';
import { MAX_DISCOVERY_CALLS_PER_TICK } from './limits';

it('caps discovery LLM calls per tick at 1', () => {
  expect(MAX_DISCOVERY_CALLS_PER_TICK).toBe(1);
});
