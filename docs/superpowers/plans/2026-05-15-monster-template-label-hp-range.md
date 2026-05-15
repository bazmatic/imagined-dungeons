# Monster Template: Per-Instance Labels and HP Range — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-instance LLM-generated name prefixes and HP ranges to `MonsterTemplate`, so spawned agents are individually varied.

**Architecture:** `MonsterTemplate` gains `labelPrefixInstructions` and `hpMin`/`hpMax` fields (replacing fixed `hp`). A new `generateAgentNames()` function makes a single batch LLM call at spawn time to produce unique labels; `expandSpawn()` accepts the resulting array and rolls HP per agent. The naming call happens in `tick-pass.ts` before `expandSpawn()`, keeping `expandSpawn()` a pure sync function.

**Tech Stack:** TypeScript, Drizzle ORM + SQLite, Vitest, React (admin UI). LLM calls use the existing `LanguageModel` interface (`llm.complete()` with structured JSON schema).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/core/domain/builder-types.ts` | Add `labelPrefixInstructions`, `hpMin`, `hpMax`; remove `hp` from `MonsterTemplate` and `UpsertMonsterTemplateInput` |
| Modify | `src/core/domain/builder-kinds.ts` | Add `TemplateHpRangeInvalid` to `ProblemKind` |
| Modify | `src/core/builder/validate.ts` | Update HP validation to check range |
| Modify | `src/core/builder/index.ts` | Update `asTemplateInput()` |
| Create | `drizzle/0014_monster_template_label_hp_range.sql` | DB migration |
| Modify | `src/infra/schema.ts` | Update `monsterTemplates` Drizzle table def |
| Modify | `src/infra/builder-sqlite-repository.ts` | Update `toMonsterTemplate()` and `upsertMonsterTemplate()` |
| Modify | `src/infra/builder-memory-repository.ts` | Update `upsertMonsterTemplate()` |
| Modify | `src/core/spawning/expand.ts` | Accept `labels?`, roll HP in range |
| Modify | `src/core/spawning/expand.test.ts` | Update tests for new behavior |
| Create | `src/core/spawning/generate-names.ts` | Batch LLM name generation |
| Create | `src/core/spawning/generate-names.test.ts` | Tests for name generation |
| Modify | `src/core/spawning/tick-pass.ts` | Call `generateAgentNames()` before `expandSpawn()` |
| Modify | `app/routes/admin/-components/TemplateForm.tsx` | UI: HP Min/Max inputs, Label Prefix Instructions textarea |

---

## Task 1: Update domain types

**Files:**
- Modify: `src/core/domain/builder-types.ts`
- Modify: `src/core/domain/builder-kinds.ts`

These type changes will cause compile errors in downstream files — that is expected and resolved in subsequent tasks.

- [ ] **Step 1: Update `MonsterTemplate` in `builder-types.ts`**

Replace the `hp` field with three new fields:

```typescript
// Before (around line 52–63):
export interface MonsterTemplate {
  readonly id: MonsterTemplateId;
  readonly worldId: WorldId;
  readonly templateKey: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hp: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
  readonly tags: readonly string[];
}

// After:
export interface MonsterTemplate {
  readonly id: MonsterTemplateId;
  readonly worldId: WorldId;
  readonly templateKey: string;
  readonly label: string;
  readonly labelPrefixInstructions: string | null;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hpMin: number;
  readonly hpMax: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
  readonly tags: readonly string[];
}
```

- [ ] **Step 2: Update `UpsertMonsterTemplateInput` in `builder-types.ts`**

Find `UpsertMonsterTemplateInput` (around line 290) and apply the same field changes:

```typescript
// Before:
export interface UpsertMonsterTemplateInput {
  readonly id: MonsterTemplateId;
  readonly templateKey: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hp: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
  readonly tags: readonly string[];
}

// After:
export interface UpsertMonsterTemplateInput {
  readonly id: MonsterTemplateId;
  readonly templateKey: string;
  readonly label: string;
  readonly labelPrefixInstructions: string | null;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hpMin: number;
  readonly hpMax: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
  readonly tags: readonly string[];
}
```

- [ ] **Step 3: Add `TemplateHpRangeInvalid` to `ProblemKind` in `builder-kinds.ts`**

Find the `ProblemKind` const object (around line 24) and add one entry after `TemplateHpInvalid`:

```typescript
  TemplateHpInvalid: 'template_hp_invalid',
  TemplateHpRangeInvalid: 'template_hp_range_invalid',
```

- [ ] **Step 4: Run `npm test` and note failures**

```bash
npm test 2>&1 | grep -E "error|FAIL|Error" | head -30
```

Expected: TypeScript compile errors referencing `hp`, `hpMin`, `hpMax`. These are resolved in subsequent tasks.

---

## Task 2: Update validator and `asTemplateInput()`

**Files:**
- Modify: `src/core/builder/validate.ts`
- Modify: `src/core/builder/index.ts`

- [ ] **Step 1: Update HP validation in `validate.ts`**

Find the template validation block (around line 163). Replace the single `hp` check with range checks:

```typescript
// Before:
    if (tpl.hp <= 0) {
      problems.push({
        kind: ProblemKind.TemplateHpInvalid,
        entity: EntityKind.MonsterTemplate,
        entityId: tpl.id as string,
        message: `template ${tpl.id} hp must be > 0`,
      });
    }

// After:
    if (tpl.hpMin <= 0) {
      problems.push({
        kind: ProblemKind.TemplateHpInvalid,
        entity: EntityKind.MonsterTemplate,
        entityId: tpl.id as string,
        message: `template ${tpl.id} hpMin must be > 0`,
      });
    }
    if (tpl.hpMax < tpl.hpMin) {
      problems.push({
        kind: ProblemKind.TemplateHpRangeInvalid,
        entity: EntityKind.MonsterTemplate,
        entityId: tpl.id as string,
        message: `template ${tpl.id} hpMax must be >= hpMin`,
      });
    }
```

- [ ] **Step 2: Update `asTemplateInput()` in `builder/index.ts`**

Find `asTemplateInput` (around line 432). Update to use new fields:

```typescript
const asTemplateInput = (t: MonsterTemplate): UpsertMonsterTemplateInput => ({
  id: t.id,
  templateKey: t.templateKey,
  label: t.label,
  labelPrefixInstructions: t.labelPrefixInstructions,
  shortDescription: t.shortDescription,
  longDescription: t.longDescription,
  hpMin: t.hpMin,
  hpMax: t.hpMax,
  mood: t.mood,
  startingItems: t.startingItems,
  tags: t.tags,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/builder-types.ts src/core/domain/builder-kinds.ts src/core/builder/validate.ts src/core/builder/index.ts
git commit -m "feat(types): add labelPrefixInstructions and hpMin/hpMax to MonsterTemplate"
```

---

## Task 3: Database migration and Drizzle schema

**Files:**
- Create: `drizzle/0014_monster_template_label_hp_range.sql`
- Modify: `src/infra/schema.ts`

- [ ] **Step 1: Create the migration file**

Create `drizzle/0014_monster_template_label_hp_range.sql` with this content:

```sql
ALTER TABLE `monster_templates` ADD `label_prefix_instructions` text;
--> statement-breakpoint
ALTER TABLE `monster_templates` ADD `hp_min` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `monster_templates` ADD `hp_max` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `monster_templates` SET `hp_min` = `hp`, `hp_max` = `hp`;
--> statement-breakpoint
ALTER TABLE `monster_templates` DROP COLUMN `hp`;
```

- [ ] **Step 2: Update `monsterTemplates` table in `src/infra/schema.ts`**

Find the `monsterTemplates` definition (around line 141). Replace `hp` with the three new columns:

```typescript
export const monsterTemplates = sqliteTable(
  'monster_templates',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    templateKey: text('template_key').notNull(),
    label: text('label').notNull(),
    labelPrefixInstructions: text('label_prefix_instructions'),
    shortDescription: text('short_description').notNull(),
    longDescription: text('long_description').notNull(),
    hpMin: integer('hp_min').notNull(),
    hpMax: integer('hp_max').notNull(),
    mood: text('mood'),
    startingItemsJson: text('starting_items_json').notNull().default('[]'),
    tags: text('tags').notNull().default('[]'),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.id] })],
);
```

- [ ] **Step 3: Commit**

```bash
git add drizzle/0014_monster_template_label_hp_range.sql src/infra/schema.ts
git commit -m "feat(db): add labelPrefixInstructions and hpMin/hpMax to monster_templates"
```

---

## Task 4: Update repositories

**Files:**
- Modify: `src/infra/builder-sqlite-repository.ts`
- Modify: `src/infra/builder-memory-repository.ts`

- [ ] **Step 1: Update `toMonsterTemplate()` in `builder-sqlite-repository.ts`**

Find `toMonsterTemplate` (around line 629). Replace `hp` with `hpMin`/`hpMax` and add `labelPrefixInstructions`:

```typescript
function toMonsterTemplate(
  r: typeof schema.monsterTemplates.$inferSelect,
  w: WorldId,
): MonsterTemplate {
  return {
    id: asMonsterTemplateId(r.id),
    worldId: w,
    templateKey: r.templateKey,
    label: r.label,
    labelPrefixInstructions: r.labelPrefixInstructions ?? null,
    shortDescription: r.shortDescription,
    longDescription: r.longDescription,
    hpMin: r.hpMin,
    hpMax: r.hpMax,
    mood: r.mood,
    startingItems: JSON.parse(r.startingItemsJson) as StarterPackEntry[],
    tags: parseTagsJson(r.tags),
  };
}
```

- [ ] **Step 2: Update `upsertMonsterTemplate()` in `builder-sqlite-repository.ts`**

Find `upsertMonsterTemplate` (around line 325). Replace `hp` with `hpMin`/`hpMax` and add `labelPrefixInstructions` in both the `.values()` and `.set()` objects:

```typescript
  async upsertMonsterTemplate(w: WorldId, i: UpsertMonsterTemplateInput): Promise<void> {
    await this.db
      .insert(schema.monsterTemplates)
      .values({
        id: i.id,
        worldId: w,
        templateKey: i.templateKey,
        label: i.label,
        labelPrefixInstructions: i.labelPrefixInstructions,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
        hpMin: i.hpMin,
        hpMax: i.hpMax,
        mood: i.mood,
        startingItemsJson: JSON.stringify(i.startingItems),
        tags: JSON.stringify(i.tags),
      })
      .onConflictDoUpdate({
        target: [schema.monsterTemplates.worldId, schema.monsterTemplates.id],
        set: {
          templateKey: i.templateKey,
          label: i.label,
          labelPrefixInstructions: i.labelPrefixInstructions,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
          hpMin: i.hpMin,
          hpMax: i.hpMax,
          mood: i.mood,
          startingItemsJson: JSON.stringify(i.startingItems),
          tags: JSON.stringify(i.tags),
        },
      });
  }
```

- [ ] **Step 3: Update `upsertMonsterTemplate()` in `builder-memory-repository.ts`**

Find `upsertMonsterTemplate` (around line 222). Replace `hp` with new fields:

```typescript
  async upsertMonsterTemplate(w: WorldId, i: UpsertMonsterTemplateInput) {
    this.bucket(this.templates, w).set(i.id, {
      id: asMonsterTemplateId(i.id),
      worldId: w,
      templateKey: i.templateKey,
      label: i.label,
      labelPrefixInstructions: i.labelPrefixInstructions,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      hpMin: i.hpMin,
      hpMax: i.hpMax,
      mood: i.mood,
      startingItems: i.startingItems,
      tags: [...i.tags],
    });
  }
```

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -20
```

Expected: remaining failures only in `expand.test.ts` (which still references the old `tpl.hp` fixture). All repository tests should pass.

- [ ] **Step 5: Commit**

```bash
git add src/infra/builder-sqlite-repository.ts src/infra/builder-memory-repository.ts
git commit -m "feat(infra): update repositories for hpMin/hpMax and labelPrefixInstructions"
```

---

## Task 5: Update `expandSpawn()`

**Files:**
- Modify: `src/core/spawning/expand.ts`
- Modify: `src/core/spawning/expand.test.ts`

- [ ] **Step 1: Update the test fixture in `expand.test.ts`**

Find the `tpl` fixture (around line 10). Replace `hp: 5` with `hpMin`/`hpMax` and add `labelPrefixInstructions`:

```typescript
const tpl: MonsterTemplate = {
  id: asMonsterTemplateId('tpl_goblin'),
  worldId: W,
  templateKey: 'goblin',
  label: 'goblin',
  labelPrefixInstructions: null,
  shortDescription: 'a goblin',
  longDescription: 'a small goblin',
  hpMin: 3,
  hpMax: 7,
  mood: 'wary',
  startingItems: [],
  tags: [],
};
```

- [ ] **Step 2: Update existing assertions in `expand.test.ts`**

In the first test, replace `expect(a.hp).toBe(5)` with a range check:

```typescript
it('produces count agent inserts at the given location', () => {
  const inserts = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3 });
  expect(inserts).toHaveLength(3);
  for (const a of inserts) {
    expect(a.locationId).toBe(asLocationId('loc_a'));
    expect(a.label).toBe('goblin');
    expect(a.hp).toBeGreaterThanOrEqual(3);
    expect(a.hp).toBeLessThanOrEqual(7);
    expect(a.mood).toBe('wary');
  }
});
```

- [ ] **Step 3: Add new tests for `labels` param and HP range edges in `expand.test.ts`**

Add these tests to the `describe('expandSpawn')` block:

```typescript
  it('uses provided labels array instead of template.label', () => {
    const labels = ['[Tall] goblin', '[Short] goblin', '[Old] goblin'];
    const inserts = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3, labels });
    expect(inserts.map((a) => a.label)).toEqual(labels);
  });

  it('falls back to template.label when labels array is shorter than count', () => {
    const labels = ['[Tall] goblin'];
    const inserts = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3, labels });
    expect(inserts[0]?.label).toBe('[Tall] goblin');
    expect(inserts[1]?.label).toBe('goblin');
    expect(inserts[2]?.label).toBe('goblin');
  });

  it('rolls hp within hpMin/hpMax range', () => {
    const fixedTpl: MonsterTemplate = { ...tpl, hpMin: 5, hpMax: 5 };
    const inserts = expandSpawn({ template: fixedTpl, locationId: asLocationId('loc_a'), count: 5 });
    for (const a of inserts) {
      expect(a.hp).toBe(5);
    }
  });
```

- [ ] **Step 4: Run tests to verify failures**

```bash
npm test src/core/spawning/expand.test.ts 2>&1 | tail -20
```

Expected: failures because `expandSpawn` still uses `template.hp` and doesn't accept `labels`.

- [ ] **Step 5: Update `expandSpawn()` in `expand.ts`**

```typescript
import type { MonsterTemplate, UpsertAgentInput } from '@core/domain/builder-types';
import { type AgentId, type LocationId, asAgentId } from '@core/domain/ids';

const newSpawnedAgentId = (templateKey: string): AgentId =>
  asAgentId(`char_${templateKey}_${Math.random().toString(36).slice(2, 10)}`);

export function expandSpawn(args: {
  readonly template: MonsterTemplate;
  readonly locationId: LocationId;
  readonly count: number;
  readonly labels?: readonly string[];
}): readonly UpsertAgentInput[] {
  const out: UpsertAgentInput[] = [];
  for (let i = 0; i < args.count; i++) {
    const hp =
      Math.floor(Math.random() * (args.template.hpMax - args.template.hpMin + 1)) +
      args.template.hpMin;
    out.push({
      id: newSpawnedAgentId(args.template.templateKey),
      label: args.labels?.[i] ?? args.template.label,
      shortDescription: args.template.shortDescription,
      longDescription: args.template.longDescription,
      locationId: args.locationId,
      hp,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: args.template.mood,
      goal: null,
      autonomous: false,
      gold: 0,
      tags: [...args.template.tags],
      secretDescription: '',
    });
  }
  return out;
}
```

- [ ] **Step 6: Run tests**

```bash
npm test src/core/spawning/expand.test.ts 2>&1 | tail -20
```

Expected: all tests in `expand.test.ts` pass.

- [ ] **Step 7: Run full suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass except integration tests that seed MonsterTemplate rows with the old `hp` field (if any). Address those by updating the seeder fixture if needed.

- [ ] **Step 8: Commit**

```bash
git add src/core/spawning/expand.ts src/core/spawning/expand.test.ts
git commit -m "feat(spawn): accept per-agent labels and roll HP within range"
```

---

## Task 6: Create `generateAgentNames()`

**Files:**
- Create: `src/core/spawning/generate-names.ts`
- Create: `src/core/spawning/generate-names.test.ts`

- [ ] **Step 1: Write failing tests in `generate-names.test.ts`**

Create `src/core/spawning/generate-names.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test src/core/spawning/generate-names.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module './generate-names'`.

- [ ] **Step 3: Implement `generate-names.ts`**

Create `src/core/spawning/generate-names.ts`:

```typescript
import type { MonsterTemplate } from '@core/domain/builder-types';
import type { JsonSchema, LanguageModel } from '@core/engine/language-model';

const NAMES_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    names: { type: 'array', items: { type: 'string' } },
  },
  required: ['names'],
  additionalProperties: false,
};

function numberedNames(label: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${label} ${i + 1}`);
}

export async function generateAgentNames(
  template: MonsterTemplate,
  count: number,
  llm: LanguageModel | null,
): Promise<string[]> {
  const fallback = numberedNames(template.label, count);

  if (!template.labelPrefixInstructions || !llm) return fallback;

  try {
    const resp = await llm.complete({
      system:
        'You generate unique names for fantasy NPCs. Return only the JSON object — no commentary.',
      user: JSON.stringify({
        baseLabel: template.label,
        instructions: template.labelPrefixInstructions,
        count,
      }),
      schema: NAMES_SCHEMA,
      schemaName: 'AgentNames',
    });

    const raw = (resp.parsed as { names?: unknown }).names;
    const llmNames = Array.isArray(raw)
      ? raw.filter((n): n is string => typeof n === 'string')
      : [];

    return fallback.map((fb, i) => llmNames[i] ?? fb);
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test src/core/spawning/generate-names.test.ts 2>&1 | tail -10
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/spawning/generate-names.ts src/core/spawning/generate-names.test.ts
git commit -m "feat(spawn): add generateAgentNames for batch LLM name generation"
```

---

## Task 7: Wire `tick-pass.ts`

**Files:**
- Modify: `src/core/spawning/tick-pass.ts`

- [ ] **Step 1: Import `generateAgentNames` at the top of `tick-pass.ts`**

Add this import alongside the existing `expandSpawn` import:

```typescript
import { generateAgentNames } from './generate-names';
```

- [ ] **Step 2: Call `generateAgentNames` before `expandSpawn`**

Find the block where `expandSpawn` is called (around line 60). Replace:

```typescript
const inserts = expandSpawn({ template: tpl, locationId: hit.trigger.locationId, count });
```

With:

```typescript
const labels = await generateAgentNames(tpl, count, args.llm);
const inserts = expandSpawn({ template: tpl, locationId: hit.trigger.locationId, count, labels });
```

- [ ] **Step 3: Run full suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/spawning/tick-pass.ts
git commit -m "feat(spawn): generate unique agent names via LLM before expanding spawn"
```

---

## Task 8: Update Admin UI

**Files:**
- Modify: `app/routes/admin/-components/TemplateForm.tsx`

- [ ] **Step 1: Update the `useState` initial value**

Find the `useState` call (around line 28). Replace `hp: tpl.hp` with the new fields:

```typescript
  const [v, setV] = useState(
    tpl
      ? {
          id: tpl.id as string,
          templateKey: tpl.templateKey,
          label: tpl.label,
          labelPrefixInstructions: tpl.labelPrefixInstructions ?? '',
          shortDescription: tpl.shortDescription,
          longDescription: tpl.longDescription,
          hpMin: tpl.hpMin,
          hpMax: tpl.hpMax,
          mood: tpl.mood ?? '',
          startingItems: tpl.startingItems,
          tags: tpl.tags,
        }
      : null,
  );
```

- [ ] **Step 2: Update the `save` function**

Find the `upsertTemplate` call (around line 56). Replace `hp: v.hp` with the new fields:

```typescript
      await upsertTemplate({
        data: {
          worldId: tree.summary.id as string,
          payload: {
            id: v.id,
            templateKey: v.templateKey,
            label: v.label,
            labelPrefixInstructions: v.labelPrefixInstructions === '' ? null : v.labelPrefixInstructions,
            shortDescription: v.shortDescription,
            longDescription: v.longDescription,
            hpMin: v.hpMin,
            hpMax: v.hpMax,
            mood: v.mood === '' ? null : v.mood,
            startingItems: v.startingItems,
            tags: v.tags,
          },
        },
      });
```

- [ ] **Step 3: Add `labelPrefixInstructions` textarea to the form**

Find the label field in the `form-grid__primary` div (around line 56). Add the textarea immediately after the label input's closing `</div>`:

```tsx
  <div>
    <label htmlFor="tpl-label-prefix" className="form-grid__field-label">
      Label Prefix Instructions
    </label>
    <textarea
      id="tpl-label-prefix"
      className="manuscript-input-v2"
      rows={3}
      value={v.labelPrefixInstructions}
      placeholder="LLM instructions for generating a unique prefix per spawn, e.g. 'Generate a short physical/personality descriptor in square brackets'"
      onChange={(e) => update({ labelPrefixInstructions: e.target.value })}
    />
  </div>
```

- [ ] **Step 4: Replace the single HP input with HP Min / HP Max**

Find the HP field in `MetadataColumn` (around line 89). Replace the single input block:

```tsx
    <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
      <label className="row-editor__field-label" htmlFor="tpl-hp-min">
        HP Min
      </label>
      <input
        id="tpl-hp-min"
        type="number"
        className="row-editor__input"
        value={v.hpMin}
        min={1}
        onChange={(e) => update({ hpMin: Number(e.target.value) })}
      />
    </div>
    <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
      <label className="row-editor__field-label" htmlFor="tpl-hp-max">
        HP Max
      </label>
      <input
        id="tpl-hp-max"
        type="number"
        className="row-editor__input"
        value={v.hpMax}
        min={1}
        onChange={(e) => update({ hpMax: Number(e.target.value) })}
      />
    </div>
```

- [ ] **Step 5: Run full suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/routes/admin/-components/TemplateForm.tsx
git commit -m "feat(ui): replace HP field with HP Min/Max and add Label Prefix Instructions"
```

---

## Completion check

- [ ] **Run full test suite one final time**

```bash
npm test 2>&1 | tail -10
```

Expected output (all passing):
```
Test Files  68 passed (68)
     Tests  500+ passed
```

- [ ] **Verify TypeScript build is clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (zero errors).
