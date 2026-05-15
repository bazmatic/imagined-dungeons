# Spawn Narration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a spawn trigger fires and the player witnesses it, generate a vivid LLM narration of the agents' arrival and append it to the player's witnessed output in the same tick.

**Architecture:** A new `generateSpawnNarration` function in `src/core/spawning/narration.ts` groups `AgentSpawned` events by location, filters to those the player witnessed, and makes one targeted LLM call per location. The result is a transient string — no stored description updates — appended directly to `witnessed[]` in `runTick` immediately after the spawn pass.

**Tech Stack:** TypeScript, Vitest, existing `LanguageModel` / `Repository` interfaces, `MemoryRepository` + `makeFakeLanguageModel` for tests.

---

### Task 1: Write failing tests for `generateSpawnNarration`

**Files:**
- Create: `src/core/spawning/narration.ts` (stub only)
- Create: `src/core/spawning/narration.test.ts`

- [ ] **Step 1: Create the stub**

Create `src/core/spawning/narration.ts` with just enough to allow the test file to import:

```ts
import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import type { LanguageModel } from '@core/engine/language-model';
import type { Repository } from '@core/engine/repository';

export async function generateSpawnNarration(_args: {
  readonly spawnEvents: readonly DomainEvent[];
  readonly playerId: AgentId;
  readonly repo: Repository;
  readonly llm: LanguageModel | null;
}): Promise<readonly string[]> {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Create the test file**

Create `src/core/spawning/narration.test.ts`:

```ts
import type { Agent } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import {
  asAgentId,
  asEventId,
  asLocationId,
  asMonsterTemplateId,
  asWorldId,
} from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { generateSpawnNarration } from './narration';

const W = asWorldId('w_live');
const PLAYER = asAgentId('char_p');
const ZOMBIE = asAgentId('char_zombie');
const LOC_A = asLocationId('loc_a');

const location = {
  id: LOC_A,
  worldId: W,
  label: 'Ash Lane',
  shortDescription: 'A smoke-choked alley.',
  longDescription: 'A long dark alley filled with ash.',
  tags: [],
  secretDescription: '',
};

const playerAgent: Agent = {
  id: PLAYER,
  worldId: W,
  label: 'Paff',
  shortDescription: 'The player.',
  longDescription: 'The player character.',
  locationId: LOC_A,
  hp: 10,
  damage: 1,
  defense: 0,
  capacity: 5,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  secretDescription: '',
};

const zombieAgent: Agent = {
  id: ZOMBIE,
  worldId: W,
  label: 'Ash Zombie',
  shortDescription: 'A blackened undead figure.',
  longDescription: 'A shambling corpse covered in ash.',
  locationId: LOC_A,
  hp: 8,
  damage: 2,
  defense: 0,
  capacity: 0,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: true,
  awake: true,
  gold: 0,
  tags: [],
  secretDescription: '',
};

function makeRepo() {
  return new MemoryRepository({
    locations: [location],
    agents: [playerAgent, zombieAgent],
    exits: [],
    items: [],
  });
}

function makeSpawnEvent(opts: {
  spawnedAgentId?: typeof ZOMBIE;
  locationId?: typeof LOC_A;
  witnesses?: readonly (typeof PLAYER)[];
}): DomainEvent {
  return {
    id: asEventId('ev_spawn'),
    worldId: W,
    actorId: asAgentId('char_system'),
    kind: EventKind.AgentSpawned,
    spawnedAgentId: opts.spawnedAgentId ?? ZOMBIE,
    locationId: opts.locationId ?? LOC_A,
    witnesses: opts.witnesses ?? [PLAYER],
    templateId: asMonsterTemplateId('tpl_zombie'),
  };
}

describe('generateSpawnNarration', () => {
  it('returns [] when llm is null', async () => {
    const repo = makeRepo();
    const result = await generateSpawnNarration({
      spawnEvents: [makeSpawnEvent({})],
      playerId: PLAYER,
      repo,
      llm: null,
    });
    expect(result).toEqual([]);
  });

  it('returns [] and makes no LLM call when player is not in witnesses', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({ parsed: { narration: 'Should not appear.' } }),
    });
    const result = await generateSpawnNarration({
      spawnEvents: [makeSpawnEvent({ witnesses: [] })],
      playerId: PLAYER,
      repo: makeRepo(),
      llm,
    });
    expect(result).toEqual([]);
    expect(llm.calls).toHaveLength(0);
  });

  it('returns narration string when player is a witness', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({ parsed: { narration: 'A zombie lurches forward.' } }),
    });
    const result = await generateSpawnNarration({
      spawnEvents: [makeSpawnEvent({ witnesses: [PLAYER] })],
      playerId: PLAYER,
      repo: makeRepo(),
      llm,
    });
    expect(result).toEqual(['A zombie lurches forward.']);
    expect(llm.calls).toHaveLength(1);
  });

  it('batches multiple spawns at the same location into one LLM call', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({ parsed: { narration: 'Two zombies appear.' } }),
    });
    const result = await generateSpawnNarration({
      spawnEvents: [
        makeSpawnEvent({ witnesses: [PLAYER] }),
        makeSpawnEvent({ witnesses: [PLAYER] }),
      ],
      playerId: PLAYER,
      repo: makeRepo(),
      llm,
    });
    expect(result).toHaveLength(1);
    expect(llm.calls).toHaveLength(1);
  });

  it('returns [] and does not throw when LLM errors', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => {
        throw new Error('LLM unavailable');
      },
    });
    const result = await generateSpawnNarration({
      spawnEvents: [makeSpawnEvent({ witnesses: [PLAYER] })],
      playerId: PLAYER,
      repo: makeRepo(),
      llm,
    });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run src/core/spawning/narration.test.ts
```

Expected: all 5 tests fail with `Error: not implemented`.

---

### Task 2: Implement `generateSpawnNarration`

**Files:**
- Modify: `src/core/spawning/narration.ts`

- [ ] **Step 1: Replace the stub with the full implementation**

Replace the entire contents of `src/core/spawning/narration.ts`:

```ts
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, LocationId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import type { JsonSchema, LanguageModel } from '@core/engine/language-model';
import type { Repository } from '@core/engine/repository';

const NARRATION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { narration: { type: 'string' } },
  required: ['narration'],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  'You are a dungeon master narrating a tabletop RPG. Write a vivid, present-tense description of these creatures arriving in this location. Two to three sentences. Do not reference game mechanics or stats.';

export async function generateSpawnNarration(args: {
  readonly spawnEvents: readonly DomainEvent[];
  readonly playerId: AgentId;
  readonly repo: Repository;
  readonly llm: LanguageModel | null;
}): Promise<readonly string[]> {
  const { spawnEvents, playerId, repo, llm } = args;
  if (!llm) return [];

  // Group AgentSpawned events by location, keeping only those the player witnessed
  const byLocation = new Map<LocationId, Array<{ spawnedAgentId: AgentId }>>();
  for (const ev of spawnEvents) {
    if (ev.kind !== EventKind.AgentSpawned) continue;
    if (!ev.witnesses.some((w) => w === playerId)) continue;
    const group = byLocation.get(ev.locationId) ?? [];
    group.push({ spawnedAgentId: ev.spawnedAgentId });
    byLocation.set(ev.locationId, group);
  }
  if (byLocation.size === 0) return [];

  const narrations: string[] = [];
  for (const [locationId, entries] of byLocation) {
    try {
      const location = await repo.getLocation(locationId);
      const agents = await Promise.all(entries.map((e) => repo.getAgent(e.spawnedAgentId)));
      const user = [
        `Location: ${location.label}`,
        location.shortDescription,
        '',
        'Creatures arriving:',
        ...agents.map((a) => `- ${a.label}: ${a.shortDescription}`),
      ].join('\n');
      const response = await llm.complete({
        system: SYSTEM_PROMPT,
        user,
        schema: NARRATION_SCHEMA,
        schemaName: 'SpawnNarration',
      });
      const parsed = response.parsed as { narration?: string };
      if (parsed?.narration) narrations.push(parsed.narration);
    } catch {
      // Skip narration on LLM error; player still sees "X appeared" from the event
    }
  }
  return narrations;
}
```

- [ ] **Step 2: Run tests to confirm they all pass**

```bash
npx vitest run src/core/spawning/narration.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 3: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/spawning/narration.ts src/core/spawning/narration.test.ts
git commit -m "feat: generateSpawnNarration — transient LLM narration for witnessed spawns"
```

---

### Task 3: Wire `generateSpawnNarration` into the tick pipeline

**Files:**
- Modify: `src/core/engine/tick.ts`

- [ ] **Step 1: Add the import**

At the top of `src/core/engine/tick.ts`, alongside the other spawning imports, add:

```ts
import { generateSpawnNarration } from '@core/spawning/narration';
```

- [ ] **Step 2: Call `generateSpawnNarration` after the spawn pass**

Find the spawn pass block in `runTick` (around line 538). It currently ends like this:

```ts
  if (opts.builderRepo) {
    const spawnPerception = await buildPerceptionView(playerId, repo);
    const spawnResult = await runSpawnTickPass({
      worldId: spawnPerception.worldId,
      events,
      engineRepo: repo,
      builderRepo: opts.builderRepo,
      llm,
      perception: spawnPerception.view,
    });
    for (const ev of spawnResult.events) {
      events.push(ev);
      const line = await renderWitnessForPlayer(ev, playerId, repo);
      if (line !== null && line.length > 0) witnessed.push(line);
    }
  }
```

Add the narration call inside the `if (opts.builderRepo)` block, immediately after the `for` loop:

```ts
  if (opts.builderRepo) {
    const spawnPerception = await buildPerceptionView(playerId, repo);
    const spawnResult = await runSpawnTickPass({
      worldId: spawnPerception.worldId,
      events,
      engineRepo: repo,
      builderRepo: opts.builderRepo,
      llm,
      perception: spawnPerception.view,
    });
    for (const ev of spawnResult.events) {
      events.push(ev);
      const line = await renderWitnessForPlayer(ev, playerId, repo);
      if (line !== null && line.length > 0) witnessed.push(line);
    }
    // Transient LLM narration describing the arrival — does not update stored descriptions
    const spawnNarrations = await generateSpawnNarration({
      spawnEvents: spawnResult.events,
      playerId,
      repo,
      llm,
    });
    for (const line of spawnNarrations) witnessed.push(line);
  }
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. The tick tests that don't supply a `builderRepo` are unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/core/engine/tick.ts
git commit -m "feat: wire spawn narration into tick pipeline after spawn pass"
```
