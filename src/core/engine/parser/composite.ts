import type { ParseError } from '@core/domain/actions';
import type { Agent, Item } from '@core/domain/entities';
import { ActionKind, ParseErrorKind } from '@core/domain/kinds';
import { log } from '@core/log';
import { generateOpening } from '../generate-opening';
import type { LanguageModel } from '../language-model';
import { llmInterpret } from '../llm-interpret';
import { type ParseResult, parse as ruleParseDefault } from '../parser';
import type { PerceptionView } from '../perception';

export type RuleParse = (
  text: string,
  actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
) => ParseResult;

export type ParseFn = (
  text: string,
  actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
) => Promise<ParseResult>;

export interface CompositeParserDeps {
  readonly llm: LanguageModel | null;
  readonly ruleParse?: RuleParse;
}

const FALLBACK_KINDS: ReadonlySet<ParseError['kind']> = new Set<ParseError['kind']>([
  ParseErrorKind.UnknownVerb,
  ParseErrorKind.NoSuchTarget,
  ParseErrorKind.UnknownDirection,
  ParseErrorKind.MissingArgument,
]);

const shouldFallback = (e: ParseError): boolean => FALLBACK_KINDS.has(e.kind);

export function makeCompositeParser(deps: CompositeParserDeps): ParseFn {
  const ruleParse = deps.ruleParse ?? ruleParseDefault;
  return async function parse(text, actor, view, inventory) {
    const ruleResult = ruleParse(text, actor, view, inventory);
    if ('actorId' in ruleResult) return ruleResult;
    // "talk to <agent>" with no utterance — generate an opening line via LLM.
    if (ruleResult.kind === ParseErrorKind.NoUtterance && deps.llm) {
      const target = view.agents.find((a) => a.id === ruleResult.targetAgentId);
      if (target) {
        const utterance = await generateOpening(actor, target, view, deps.llm);
        log.info(`[parser] generated opening for ${actor.label} -> ${target.label}: "${utterance}"`);
        return {
          kind: ActionKind.Speak,
          actorId: actor.id,
          targetAgentId: target.id,
          utterance,
        };
      }
    }
    if (!shouldFallback(ruleResult)) return ruleResult;
    if (!deps.llm) return ruleResult;
    log.info(
      `[parser] rule fallback for "${text}" (kind=${ruleResult.kind}${
        'ref' in ruleResult ? `, ref="${ruleResult.ref}"` : ''
      }${'verb' in ruleResult ? `, verb="${ruleResult.verb}"` : ''}); inventory=${inventory.map((i) => i.label).join('|') || '(empty)'}`,
    );
    try {
      const result = await llmInterpret(text, actor, view, inventory, deps.llm);
      if (!result) {
        // The LLM couldn't classify, even with the wide vocabulary. Surface
        // a graceful failure instead of the rule layer's verb-specific
        // complaint ("I don't know the verb X."). The rule layer is a
        // performance cache — its errors are not user-facing if the LLM is
        // available.
        log.info(`[llm] no action for input "${text}" — graceful fallback`);
        return {
          kind: ParseErrorKind.ImpossibleAction,
          reason: "I'm not sure how to do that. Try rephrasing.",
        };
      }
      log.info(`[llm] interpreted "${text}" as ${result.kind}`);
      return result;
    } catch (err) {
      log.warn(`[llm] error interpreting "${text}": ${String(err)}`);
      return ruleResult;
    }
  };
}
