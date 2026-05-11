import { describe, expect, it } from 'vitest';
import { addTag, removeTag, sanitizeTag } from './tags-codec';

describe('sanitizeTag', () => {
  it('trims and lowercases', () => {
    expect(sanitizeTag('  Industrial  ')).toBe('industrial');
  });
  it('returns null for empty after trim', () => {
    expect(sanitizeTag('   ')).toBeNull();
  });
  it('collapses internal whitespace to single space', () => {
    expect(sanitizeTag('high   danger')).toBe('high danger');
  });
});

describe('addTag', () => {
  it('appends a new tag', () => {
    expect(addTag(['a'], 'b')).toEqual(['a', 'b']);
  });
  it('ignores duplicates after sanitize', () => {
    expect(addTag(['industrial'], 'INDUSTRIAL')).toEqual(['industrial']);
  });
  it('ignores empty', () => {
    expect(addTag(['a'], '   ')).toEqual(['a']);
  });
});

describe('removeTag', () => {
  it('removes the tag', () => {
    expect(removeTag(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
  it('is a no-op if the tag is absent', () => {
    expect(removeTag(['a'], 'x')).toEqual(['a']);
  });
});
