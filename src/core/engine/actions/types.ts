import type { DomainEvent } from '@core/domain/events';

export interface ActionOutcome {
  readonly render: string;
  readonly event: DomainEvent;
}
