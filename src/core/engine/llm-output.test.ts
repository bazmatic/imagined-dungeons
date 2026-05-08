import { describe, expect, it } from 'vitest';
import { PLAYER_ACTION_SCHEMA, validatePlayerAction } from './llm-output';

describe('PLAYER_ACTION_SCHEMA', () => {
  it('is a strict flat object compatible with OpenAI structured outputs', () => {
    expect(PLAYER_ACTION_SCHEMA.type).toBe('object');
    expect(PLAYER_ACTION_SCHEMA.additionalProperties).toBe(false);
    // Strict mode forbids oneOf at the root.
    expect(PLAYER_ACTION_SCHEMA.oneOf).toBeUndefined();
    // Strict mode requires every property to also appear in `required`.
    const props = Object.keys(PLAYER_ACTION_SCHEMA.properties ?? {});
    expect(new Set(PLAYER_ACTION_SCHEMA.required)).toEqual(new Set(props));
    expect(props).toEqual(
      expect.arrayContaining([
        'kind',
        'direction',
        'targetKind',
        'targetRef',
        'itemRef',
        'targetAgentRef',
        'utterance',
        'emoteDescription',
        'reason',
      ]),
    );
  });
});

describe('validatePlayerAction', () => {
  it('accepts a valid move with a canonical direction', () => {
    const r = validatePlayerAction({ kind: 'move', direction: 'south' });
    expect(r).toEqual({ kind: 'move', direction: 'south' });
  });

  it('accepts move for every cardinal/ordinal/vertical direction', () => {
    for (const d of [
      'north',
      'south',
      'east',
      'west',
      'northeast',
      'northwest',
      'southeast',
      'southwest',
      'up',
      'down',
    ]) {
      expect(validatePlayerAction({ kind: 'move', direction: d })).toEqual({
        kind: 'move',
        direction: d,
      });
    }
  });

  it('rejects move with a non-canonical direction', () => {
    expect(validatePlayerAction({ kind: 'move', direction: 'sideways' })).toEqual({
      kind: 'invalid',
    });
  });

  it('accepts look with targetKind=null (room) and resolves to a room target', () => {
    expect(validatePlayerAction({ kind: 'look', targetKind: null, targetRef: null })).toEqual({
      kind: 'look',
      target: { kind: 'room' },
    });
    expect(validatePlayerAction({ kind: 'look', targetKind: 'room', targetRef: null })).toEqual({
      kind: 'look',
      target: { kind: 'room' },
    });
  });

  it('accepts look with item/agent/exit targetKind and a non-empty targetRef', () => {
    expect(
      validatePlayerAction({ kind: 'look', targetKind: 'item', targetRef: 'fire map' }),
    ).toEqual({
      kind: 'look',
      target: { kind: 'item', ref: 'fire map' },
    });
    expect(validatePlayerAction({ kind: 'look', targetKind: 'agent', targetRef: 'Spark' })).toEqual(
      {
        kind: 'look',
        target: { kind: 'agent', ref: 'Spark' },
      },
    );
    expect(
      validatePlayerAction({ kind: 'look', targetKind: 'exit', targetRef: 'tavern back door' }),
    ).toEqual({
      kind: 'look',
      target: { kind: 'exit', ref: 'tavern back door' },
    });
  });

  it('rejects look with a non-room targetKind and missing/empty targetRef', () => {
    expect(validatePlayerAction({ kind: 'look', targetKind: 'item', targetRef: '' })).toEqual({
      kind: 'invalid',
    });
    expect(validatePlayerAction({ kind: 'look', targetKind: 'agent', targetRef: null })).toEqual({
      kind: 'invalid',
    });
    expect(validatePlayerAction({ kind: 'look', targetKind: 'banana', targetRef: 'x' })).toEqual({
      kind: 'invalid',
    });
  });

  it('accepts take and drop with non-empty itemRef', () => {
    expect(validatePlayerAction({ kind: 'take', itemRef: 'fire map' })).toEqual({
      kind: 'take',
      itemRef: 'fire map',
    });
    expect(validatePlayerAction({ kind: 'drop', itemRef: 'fire map' })).toEqual({
      kind: 'drop',
      itemRef: 'fire map',
    });
  });

  it('rejects take/drop with empty or non-string itemRef', () => {
    expect(validatePlayerAction({ kind: 'take', itemRef: '' })).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'take', itemRef: 42 })).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'drop' })).toEqual({ kind: 'invalid' });
  });

  it('accepts inventory with no other fields', () => {
    expect(validatePlayerAction({ kind: 'inventory' })).toEqual({ kind: 'inventory' });
  });

  it('returns the unknown variant verbatim with the reason string', () => {
    expect(validatePlayerAction({ kind: 'unknown', reason: 'not a verb i know' })).toEqual({
      kind: 'unknown',
      reason: 'not a verb i know',
    });
  });

  it('rejects malformed inputs', () => {
    expect(validatePlayerAction(null)).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction('move south')).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({})).toEqual({ kind: 'invalid' });
    // Missing targetAgentRef on attack:
    expect(validatePlayerAction({ kind: 'attack', target: 'spark' })).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'move' })).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'unknown' })).toEqual({ kind: 'invalid' });
  });

  it('accepts speak with non-empty targetAgentRef and utterance', () => {
    expect(
      validatePlayerAction({
        kind: 'speak',
        targetAgentRef: 'spark',
        utterance: 'hello',
      }),
    ).toEqual({ kind: 'speak', targetAgentRef: 'spark', utterance: 'hello' });
  });

  it('accepts speak without an addressee — empty/missing targetAgentRef normalises to null (broadcast)', () => {
    expect(validatePlayerAction({ kind: 'speak', targetAgentRef: '', utterance: 'hi' })).toEqual({
      kind: 'speak',
      targetAgentRef: null,
      utterance: 'hi',
    });
    expect(validatePlayerAction({ kind: 'speak', targetAgentRef: null, utterance: 'hi' })).toEqual({
      kind: 'speak',
      targetAgentRef: null,
      utterance: 'hi',
    });
    expect(validatePlayerAction({ kind: 'speak', utterance: 'hi' })).toEqual({
      kind: 'speak',
      targetAgentRef: null,
      utterance: 'hi',
    });
  });

  it('rejects speak with empty/missing utterance', () => {
    expect(validatePlayerAction({ kind: 'speak', targetAgentRef: 'spark', utterance: '' })).toEqual(
      { kind: 'invalid' },
    );
    expect(validatePlayerAction({ kind: 'speak' })).toEqual({ kind: 'invalid' });
  });

  it('accepts attack with non-empty targetAgentRef', () => {
    expect(validatePlayerAction({ kind: 'attack', targetAgentRef: 'spark' })).toEqual({
      kind: 'attack',
      targetAgentRef: 'spark',
    });
  });

  it('rejects attack with missing or empty targetAgentRef', () => {
    expect(validatePlayerAction({ kind: 'attack', targetAgentRef: '' })).toEqual({
      kind: 'invalid',
    });
    expect(validatePlayerAction({ kind: 'attack' })).toEqual({ kind: 'invalid' });
  });

  it('accepts emote with non-empty description and null targetAgentRef', () => {
    expect(
      validatePlayerAction({ kind: 'emote', emoteDescription: 'wave', targetAgentRef: null }),
    ).toEqual({
      kind: 'emote',
      emoteDescription: 'wave',
      targetAgentRef: null,
    });
  });

  it('accepts emote with non-empty description and a targetAgentRef', () => {
    expect(
      validatePlayerAction({
        kind: 'emote',
        emoteDescription: 'waves',
        targetAgentRef: 'Spark',
      }),
    ).toEqual({
      kind: 'emote',
      emoteDescription: 'waves',
      targetAgentRef: 'Spark',
    });
  });

  it('rejects emote with empty or missing description', () => {
    expect(
      validatePlayerAction({ kind: 'emote', emoteDescription: '', targetAgentRef: null }),
    ).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'emote', targetAgentRef: null })).toEqual({
      kind: 'invalid',
    });
  });

  it('coerces empty-string targetAgentRef on emote to null', () => {
    expect(
      validatePlayerAction({ kind: 'emote', emoteDescription: 'shrug', targetAgentRef: '' }),
    ).toEqual({
      kind: 'emote',
      emoteDescription: 'shrug',
      targetAgentRef: null,
    });
  });
});
