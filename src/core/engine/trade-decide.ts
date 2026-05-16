import type { Agent, Item } from '@core/domain/entities';
import { log } from '@core/log';
import type { JsonSchema, LanguageModel } from './language-model';

/**
 * LLM consent call for buy/sell exchanges.
 *
 * Pure-core: given the buyer, seller, item, price, and direction, ask the
 * model whether the seller would accept the trade and to provide a short
 * in-character narration. On a malformed payload or LLM error, falls back to
 * a generic refusal so the dispatcher always gets a typed decision.
 */

export const TradeDirection = {
  Buy: 'buy',
  Sell: 'sell',
} as const;
export type TradeDirection = (typeof TradeDirection)[keyof typeof TradeDirection];

export interface TradeDecideRequest {
  readonly buyer: Agent;
  readonly seller: Agent;
  readonly item: Item;
  readonly price: number;
  readonly direction: TradeDirection;
}

export interface TradeDecision {
  readonly accept: boolean;
  readonly narration: string;
}

const SYSTEM_PROMPT_LINES: readonly string[] = [
  'You decide whether a non-player character accepts a trade.',
  '',
  'Read the seller, the buyer, and the item description. Decide whether the seller would accept the trade.',
  '',
  'If the buyer is paying the seller\'s own listed price (offered price equals listed price), the seller should accept UNLESS they have a strong in-character reason to refuse (e.g. hostile, not actually a merchant, wants a specific trade good instead of gold). Grumpiness or a hard bargain persona is NOT a reason to refuse a fair-price sale — those traits colour the narration, not the decision.',
  '',
  'Respond with a JSON object containing two fields:',
  '  - accept: boolean — true to accept the trade, false to refuse.',
  '  - narration: string — a short in-character line from the seller (one or two sentences). On accept, it should sound like agreement; on refusal, like a polite or pointed decline.',
  '',
  "Never reveal mechanics in the narration. Speak in the seller's voice.",
];

const SYSTEM_PROMPT = SYSTEM_PROMPT_LINES.join('\n');

export const TRADE_DECISION_SCHEMA_NAME = 'trade_decision';

export const TRADE_DECISION_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accept', 'narration'],
  properties: {
    accept: { type: 'boolean' },
    narration: { type: 'string' },
  },
};

function buildUserPrompt(req: TradeDecideRequest): string {
  const directionLine =
    req.direction === TradeDirection.Buy
      ? `${req.buyer.label} wants to buy the ${req.item.label} from ${req.seller.label} for ${req.price} gold.`
      : `${req.buyer.label} (an NPC) is being asked to buy the ${req.item.label} from ${req.seller.label} (the player) for ${req.price} gold.`;
  const lines: string[] = [
    directionLine,
    '',
    'Seller:',
    `  Label: ${req.seller.label}`,
    `  Short: ${req.seller.shortDescription}`,
    `  Long: ${req.seller.longDescription}`,
    `  Mood: ${req.seller.mood ?? '(none)'}`,
    `  Goal: ${req.seller.goal ?? '(none)'}`,
    `  Tags: ${req.seller.tags.join(', ') || '(none)'}`,
    `  Gold balance: ${req.seller.gold}`,
    '',
    'Buyer:',
    `  Label: ${req.buyer.label}`,
    `  Short: ${req.buyer.shortDescription}`,
    '',
    'Item:',
    `  Label: ${req.item.label}`,
    `  Short: ${req.item.shortDescription}`,
    `  Long: ${req.item.longDescription}`,
    `  Tags: ${req.item.tags.join(', ') || '(none)'}`,
    '',
    `Listed price (set by the seller): ${req.item.priceTag} gold.`,
    `Offered price: ${req.price} gold.`,
  ];
  return lines.join('\n');
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function coerceDecision(parsed: unknown): TradeDecision | null {
  if (!isRecord(parsed)) return null;
  if (typeof parsed.accept !== 'boolean') return null;
  if (typeof parsed.narration !== 'string') return null;
  return { accept: parsed.accept, narration: parsed.narration };
}

export async function tradeDecide(
  req: TradeDecideRequest,
  llm: LanguageModel,
): Promise<TradeDecision> {
  const fallback: TradeDecision = {
    accept: false,
    narration: `${req.seller.label} hesitates, then declines.`,
  };
  try {
    const response = await llm.complete({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(req),
      schema: TRADE_DECISION_SCHEMA,
      schemaName: TRADE_DECISION_SCHEMA_NAME,
    });
    const decision = coerceDecision(response.parsed);
    if (!decision) {
      log.warn('[llm] tradeDecide: malformed response, using fallback');
      return fallback;
    }
    return decision;
  } catch (err) {
    log.warn(`[llm] tradeDecide error: ${String(err)}`);
    return fallback;
  }
}
