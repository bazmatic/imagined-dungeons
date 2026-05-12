/**
 * Hard cap on discovery LLM calls per tick. A discovery is a single
 * round-trip and will not naturally fire multiple times per turn, but the
 * cap exists to prevent pathological loops (search → spawned agent →
 * narrate → ...).
 */
export const MAX_DISCOVERY_CALLS_PER_TICK = 1;
