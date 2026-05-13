# Imagined Dungeons — Project Rules

## No string literals in logic

Don't use raw string literals in logic — switch cases, comparisons, set membership, dispatch keys, `kind` fields, etc. Use `as const` objects and derive the type from them:

```ts
export const ActionKind = { Move: 'move', Look: 'look', Speak: 'speak' } as const;
export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];
// case ActionKind.Move:  ...  { kind: ActionKind.Speak, ... }
```

Why: typos in literals fail silently (`case 'attakc':` compiles but is unreachable). Const objects give you typed references, working rename, and real find-references.

Exceptions: Drizzle `text(..., { enum: [...] })` schema definitions, and string literals in test assertions.

Applies to new code and to existing code you're already touching.
