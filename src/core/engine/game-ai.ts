import type { Agent, Exit, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import { NpcFallbackIntent } from '@core/domain/kinds';
import type { Action } from '@core/domain/actions';
import type { DiscoveryRequest, DiscoveryResponse, LoreContext } from '@core/domain/builder-types';
import type { ConsequenceLoreSink } from './consequences';
import { consequencesFor } from './consequences';
import { FALLBACK_RESPONSE, runDiscovery } from './discovery';
import type { LanguageModel } from './language-model';
import { narrate } from './narrate';
import type { NpcMindOptions } from './npc-mind';
import { decideNpcIntent } from './npc-mind';
import { peekExit as peekExitLlm } from './peek-exit';
import type { HandlerRepo } from './repository';
import { type TradeDecideRequest, type TradeDecision, tradeDecide } from './trade-decide';

/**
 * Unified AI boundary. Wraps the four LLM subsystems (narration, trade
 * consent, consequence engine, NPC intent) and the generative-discovery
 * engine behind a single interface so callers never import LanguageModel
 * directly. LlmGameAI delegates to the real model; nullGameAI is a
 * no-op stub for tests and offline environments.
 */
export interface GameAI {
  narrateEvent(event: DomainEvent, witness: Agent, repo: HandlerRepo): Promise<string>;
  tradeDecision(req: TradeDecideRequest): Promise<TradeDecision>;
  consequences(
    events: readonly DomainEvent[],
    repo: HandlerRepo,
    lore?: ConsequenceLoreSink,
  ): Promise<readonly Action[]>;
  npcIntent(actorId: AgentId, repo: HandlerRepo, opts?: NpcMindOptions): Promise<readonly string[]>;
  discover(req: DiscoveryRequest): Promise<DiscoveryResponse>;
  peekExit(exit: Exit, destination: Location, lore: LoreContext | null): Promise<string | null>;
}

export const nullGameAI: GameAI = {
  narrateEvent: async () => '',
  tradeDecision: async (req) => ({ accept: false, narration: `${req.seller.label} declines.` }),
  consequences: async () => [],
  npcIntent: async () => [NpcFallbackIntent],
  discover: async () => FALLBACK_RESPONSE,
  peekExit: async () => null,
};

export class LlmGameAI implements GameAI {
  constructor(private readonly llm: LanguageModel) {}

  narrateEvent(event: DomainEvent, witness: Agent, repo: HandlerRepo): Promise<string> {
    return narrate(event, witness, repo, this.llm);
  }

  tradeDecision(req: TradeDecideRequest): Promise<TradeDecision> {
    return tradeDecide(req, this.llm);
  }

  consequences(
    events: readonly DomainEvent[],
    repo: HandlerRepo,
    lore?: ConsequenceLoreSink,
  ): Promise<readonly Action[]> {
    return consequencesFor(events, repo, this.llm, lore);
  }

  npcIntent(actorId: AgentId, repo: HandlerRepo, opts?: NpcMindOptions): Promise<readonly string[]> {
    return decideNpcIntent(actorId, repo, this.llm, opts);
  }

  discover(req: DiscoveryRequest): Promise<DiscoveryResponse> {
    return runDiscovery(req, this.llm);
  }

  peekExit(exit: Exit, destination: Location, lore: LoreContext | null): Promise<string | null> {
    return peekExitLlm(exit, destination, lore, this.llm);
  }
}
