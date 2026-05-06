import { describe, expect, it } from 'vitest';
import { type ItemId, type LocationId, asItemId, asLocationId } from './ids';

describe('branded ids', () => {
  it('asLocationId tags a string as LocationId', () => {
    const id: LocationId = asLocationId('loc_test');
    expect(id).toBe('loc_test');
  });

  it('LocationId and ItemId are not interchangeable to the type system', () => {
    const loc: LocationId = asLocationId('loc_test');
    const item: ItemId = asItemId('item_test');
    // @ts-expect-error — LocationId is not assignable to ItemId
    const wrong: ItemId = loc;
    expect(item).toBe('item_test');
    expect(wrong).toBe('loc_test');
  });
});
