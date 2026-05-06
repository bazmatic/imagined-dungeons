import type { ParseError } from '@core/domain/actions';
import type { Agent, Item } from '@core/domain/entities';
import { ParseErrorKind } from '@core/domain/kinds';
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
    if (!shouldFallback(ruleResult)) return ruleResult;
    if (!deps.llm) return ruleResult;
    try {
      const action = await llmInterpret(text, actor, view, inventory, deps.llm);
      if (!action) {
        console.info(`[llm] no action for input "${text}" — using rule-based ${ruleResult.kind}`);
        return ruleResult;
      }
      console.info(`[llm] interpreted "${text}" as ${action.kind}`);
      return action;
    } catch (err) {
      console.warn(`[llm] error interpreting "${text}":`, err);
      return ruleResult;
    }
  };
}
