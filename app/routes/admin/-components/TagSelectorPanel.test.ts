import { describe, expect, it } from 'vitest';
import { filterSuggestions } from './TagSelectorPanel';

describe('filterSuggestions', () => {
  it('excludes already-attached tags', () => {
    expect(filterSuggestions(['a', 'b', 'c'], ['b'], '')).toEqual(['a', 'c']);
  });

  it('returns all available (minus attached) when query is empty', () => {
    expect(filterSuggestions(['forest', 'wet'], [], '   ')).toEqual(['forest', 'wet']);
  });

  it('filters by case-insensitive substring', () => {
    expect(filterSuggestions(['Forest', 'wet', 'Storm'], [], 'or')).toEqual(['Forest', 'Storm']);
  });

  it('returns empty when no available tag matches', () => {
    expect(filterSuggestions(['forest'], [], 'xyz')).toEqual([]);
  });
});
