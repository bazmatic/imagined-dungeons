import { describe, expect, it } from 'vitest';
import { MAX_JUDGEMENT_CALLS_PER_TICK, MAX_SPAWNS_PER_TICK } from './limits';

describe('spawning limits', () => {
  it('exports MAX_SPAWNS_PER_TICK = 8 and MAX_JUDGEMENT_CALLS_PER_TICK = 4', () => {
    expect(MAX_SPAWNS_PER_TICK).toBe(8);
    expect(MAX_JUDGEMENT_CALLS_PER_TICK).toBe(4);
  });
});
