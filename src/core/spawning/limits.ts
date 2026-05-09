/**
 * Bounded-tick discipline: a chain of triggers must never stall the player
 * turn. Sized to match `MAX_NPCS_PER_TICK` and `MAX_CONSEQUENCE_DEPTH`.
 */
export const MAX_SPAWNS_PER_TICK = 8;

/** LLM-cost ceiling per tick for `LlmJudgement` triggers. */
export const MAX_JUDGEMENT_CALLS_PER_TICK = 4;
