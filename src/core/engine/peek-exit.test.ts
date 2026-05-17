import type { LoreContext } from '@core/domain/builder-types';
import type { Exit, Location } from '@core/domain/entities';
import { asExitId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it, vi } from 'vitest';
import { peekExit } from './peek-exit';

const W = asWorldId('w');

const exit: Exit = {
  id: asExitId('exit_n'),
  worldId: W,
  from: asLocationId('loc_a'),
  to: asLocationId('loc_b'),
  direction: 'north',
  label: 'oak door',
  locked: false,
  lockedByItem: null,
};

const destination: Location = {
  id: asLocationId('loc_b'),
  worldId: W,
  label: 'Merchant Quarter',
  shortDescription: 'A busy trading district.',
  longDescription: 'Canvas stalls line every wall of this ancient market.',
  tags: ['market', 'crowded'],
  secretDescription: '',
};

const lore: LoreContext = {
  worldOverview: 'A fantasy city wracked by fires.',
  storySoFar: '',
  tagDescriptions: {
    market: 'A place where goods are exchanged for coin.',
    crowded: 'Packed with citizens jostling for space.',
  },
};

describe('peekExit', () => {
  it('returns trimmed LLM prose', async () => {
    const llm = { completeText: vi.fn().mockResolvedValue('  You glimpse market stalls.  ') } as any;
    const result = await peekExit(exit, destination, null, llm);
    expect(result).toBe('You glimpse market stalls.');
  });

  it('includes exit label and direction in user prompt', async () => {
    let captured = '';
    const llm = { completeText: vi.fn().mockImplementation(({ user }: { user: string }) => {
      captured = user; return Promise.resolve('prose');
    }) } as any;
    await peekExit(exit, destination, null, llm);
    expect(captured).toContain('oak door');
    expect(captured).toContain('north');
  });

  it('includes destination name and both descriptions in user prompt', async () => {
    let captured = '';
    const llm = { completeText: vi.fn().mockImplementation(({ user }: { user: string }) => {
      captured = user; return Promise.resolve('prose');
    }) } as any;
    await peekExit(exit, destination, null, llm);
    expect(captured).toContain('Merchant Quarter');
    expect(captured).toContain('A busy trading district.');
    expect(captured).toContain('Canvas stalls line every wall of this ancient market.');
  });

  it('includes tag lore entries in user prompt when lore is provided', async () => {
    let captured = '';
    const llm = { completeText: vi.fn().mockImplementation(({ user }: { user: string }) => {
      captured = user; return Promise.resolve('prose');
    }) } as any;
    await peekExit(exit, destination, lore, llm);
    expect(captured).toContain('market: A place where goods are exchanged for coin.');
    expect(captured).toContain('crowded: Packed with citizens jostling for space.');
  });

  it('returns null when LLM returns empty string', async () => {
    const llm = { completeText: vi.fn().mockResolvedValue('   ') } as any;
    expect(await peekExit(exit, destination, null, llm)).toBeNull();
  });

  it('returns null when LLM throws', async () => {
    const llm = { completeText: vi.fn().mockRejectedValue(new Error('timeout')) } as any;
    expect(await peekExit(exit, destination, null, llm)).toBeNull();
  });
});
