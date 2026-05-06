import { type EventId, asEventId } from '@core/domain/ids';

let counter = 0;
export function nextEventId(now = Date.now()): EventId {
  counter = (counter + 1) % 1_000_000;
  return asEventId(`evt_${now.toString(36)}_${counter.toString(36)}`);
}
