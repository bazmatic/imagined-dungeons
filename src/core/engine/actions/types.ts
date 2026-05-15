import type { Segment } from '@core/domain/segments';
import type { DomainEvent } from '@core/domain/events';

export interface ActionOutcome {
  readonly render: readonly Segment[];
  readonly event: DomainEvent;
}
