import { describe, expect, it } from 'vitest';
import { isExpanded, makeKey, toggleNode } from './tree-state';

describe('makeKey', () => {
  it('joins kind and id with a colon', () => {
    expect(makeKey('location', 'loc-a')).toBe('location:loc-a');
  });
});

describe('toggleNode / isExpanded', () => {
  it('adds a key when not present', () => {
    const next = toggleNode(new Set(), 'location:loc-a');
    expect(isExpanded(next, 'location:loc-a')).toBe(true);
  });
  it('removes a key when present', () => {
    const next = toggleNode(new Set(['location:loc-a']), 'location:loc-a');
    expect(isExpanded(next, 'location:loc-a')).toBe(false);
  });
  it('does not mutate the input set', () => {
    const before = new Set(['location:loc-a']);
    toggleNode(before, 'location:loc-a');
    expect(before.has('location:loc-a')).toBe(true);
  });
});
