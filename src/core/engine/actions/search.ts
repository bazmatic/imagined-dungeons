import type { BuilderRepository } from '@core/builder/repository';
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import type { WorldId } from '@core/domain/ids';
import { EventKind, ExaminableKind } from '@core/domain/kinds';
import { Err, type Result } from '@core/domain/result';
import type { LanguageModel } from '../language-model';
import type { Repository } from '../repository';
import type { ActionOutcome } from './types';

export interface SearchDeps {
  readonly llm: LanguageModel;
  readonly builderRepo: BuilderRepository;
  readonly worldId: WorldId;
}

// Placeholder — filled in by the dedicated handleSearch commit.
export async function handleSearch(
  _action: Extract<Action, { kind: 'search' }>,
  _repo: Repository,
  _deps: SearchDeps,
): Promise<Result<ActionOutcome, string>> {
  // suppress unused-vars by referencing the imports lazily; these types are
  // only present so the registry compiles. The real implementation lands in
  // the next commit.
  void EventKind.Look;
  void ExaminableKind.Room;
  void ({} as DomainEvent);
  return Err('handleSearch not implemented');
}
