import type { MonsterTemplate } from '@core/domain/builder-types';
import { asMonsterTemplateId, asWorldId } from '@core/domain/ids';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { describe, expect, it } from 'vitest';
import { generateAgentNames } from './generate-names';

const W = asWorldId('w_live');

const tpl: MonsterTemplate = {
  id: asMonsterTemplateId('tpl_zombie'),
  worldId: W,
  templateKey: 'zombie',
  label: 'Ash Zombie',
  labelPrefixInstructions: 'Generate a short physical/personality descriptor in square brackets',
  shortDescription: 'a zombie',
  longDescription: 'shambling undead',
  hpMin: 5,
  hpMax: 10,
  damageMin: 1,
  damageMax: 1,
  defenseMin: 0,
  defenseMax: 0,
  mood: null,
  startingItems: [],
  tags: [],
};

const tplNoInstructions: MonsterTemplate = { ...tpl, labelPrefixInstructions: null };

describe('generateAgentNames', () => {
  it('returns numbered names when labelPrefixInstructions is null', async () => {
    const llm = makeFakeLanguageModel();
    const names = await generateAgentNames(tplNoInstructions, 3, llm);
    expect(names).toEqual(['Ash Zombie 1', 'Ash Zombie 2', 'Ash Zombie 3']);
    expect(llm.calls).toHaveLength(0);
  });

  it('returns numbered names when llm is null', async () => {
    const names = await generateAgentNames(tpl, 3, null);
    expect(names).toEqual(['Ash Zombie 1', 'Ash Zombie 2', 'Ash Zombie 3']);
  });

  it('calls LLM once and returns all names on success', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"names":["[Tall] Ash Zombie","[Short] Ash Zombie","[Old] Ash Zombie"]}',
        parsed: { names: ['[Tall] Ash Zombie', '[Short] Ash Zombie', '[Old] Ash Zombie'] },
      }),
    });
    const names = await generateAgentNames(tpl, 3, llm);
    expect(llm.calls).toHaveLength(1);
    expect(names).toEqual(['[Tall] Ash Zombie', '[Short] Ash Zombie', '[Old] Ash Zombie']);
  });

  it('fills remaining slots with numbered names when LLM returns fewer than count', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"names":["[Tall] Ash Zombie"]}',
        parsed: { names: ['[Tall] Ash Zombie'] },
      }),
    });
    const names = await generateAgentNames(tpl, 3, llm);
    expect(names).toEqual(['[Tall] Ash Zombie', 'Ash Zombie 2', 'Ash Zombie 3']);
  });

  it('falls back to numbered names when LLM throws', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => {
        throw new Error('LLM unavailable');
      },
    });
    const names = await generateAgentNames(tpl, 2, llm);
    expect(names).toEqual(['Ash Zombie 1', 'Ash Zombie 2']);
  });

  it('falls back to numbered names when LLM returns malformed JSON', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: 'oops', parsed: null }),
    });
    const names = await generateAgentNames(tpl, 2, llm);
    expect(names).toEqual(['Ash Zombie 1', 'Ash Zombie 2']);
  });
});
