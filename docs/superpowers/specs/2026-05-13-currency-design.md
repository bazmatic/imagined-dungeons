# Currency — Design

**Date:** 2026-05-13
**Status:** Approved in-conversation; awaiting written-spec review.

## Goal

Agents can own gold (a numeric balance, not an item). Items can carry a `priceTag` marking them for sale at a stated price by their current owner. The player can `buy`, `sell`, and `offer` (set a price on their own goods). An NPC seller/buyer asks a small LLM to decide whether to accept each trade. Accepted trades atomically transfer gold and the item.

## Non-goals

- No "gold coin" items, no stacking, no piles of treasure on the floor. Gold is a number on the agent.
- No counter-offers from the NPC in v1. A refusal is just a refusal; the player can `offer` at a different price and try again.
- No bulk trades, no inventories-for-sale, no shop UI. One item per trade attempt.
- No multi-currency (no silver, gemstones, etc.). One scalar field.
- No purchasing from agents in a different room. Both parties must be co-located.
- No fence/black-market mechanics, no haggle skill, no economy simulation.

## Data model

### Agent

Add one field:

| Field | Type | Default | Notes |
|---|---|---|---|
| `gold` | `number` | `0` | Running balance. Admin-editable per agent. |

### Item

Add one field:

| Field | Type | Default | Notes |
|---|---|---|---|
| `priceTag` | `number \| null` | `null` | If non-null and positive, signals "for sale at N gold by whoever currently owns it". Cleared to `null` when the item transfers via a trade. |

### Schema migration

`drizzle/0013_currency.sql` (next slot after `0012_item_container.sql`):

```sql
ALTER TABLE `agents` ADD `gold` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `price_tag` integer;
```

(Statement-breakpoint required — see the migration mishap from `0012_item_container.sql`.)

`UpsertAgentInput` and `UpsertItemInput` gain the fields. Snapshot blob save/load round-trips them; legacy blobs coerce `gold=0`, `priceTag=null`.

## Verbs

### `buy <item> from <agent>`

Player asks the named NPC (must be in the same room) to sell the named item at its `priceTag`. Initiates the trade flow below.

### `sell <item> to <agent>`

Symmetric. Player asks the named NPC to buy an item the player currently holds. The item must already have a `priceTag` — typically set via `offer` (below). Runs the trade flow with roles swapped.

### `offer <my item> for <N> gold`

Sets `priceTag = N` on an item the player currently owns. Pure state mutation; no LLM, no event beyond a confirmation render (`"You set the price of the cloak at 5 gold."`). `N` must be a positive integer.

### Parser

Rule-based cases:

- `buy <ref> from <agent>` — split on `" from "` (token-level). Resolve item against `[...view.items, ...inventory]` (then constrain to seller's inventory in the handler — parser just resolves the noun). Resolve agent against `view.agents`.
- `sell <ref> to <agent>` — split on `" to "`. Resolve item against `inventory` (must be held). Resolve agent against `view.agents`.
- `offer <ref> for <N> [gold]` — split on `" for "`, take the second clause's first token as `N`. Resolve item against `inventory`. `N` parses as a positive integer or surfaces `ImpossibleAction("Price must be a positive whole number.")`.

### LLM-interpret

`PLAYER_ACTION_SCHEMA` gains three new kinds (`buy`, `sell`, `offer`) with appropriate refs (`itemRef`, `targetAgentRef`, plus a numeric `price` field for `offer`). `validatePlayerAction` adds three branches; the dispatch in `llmInterpret` resolves refs and emits the actions exactly as the rule parser does.

Prompt: documents `buy`, `sell`, `offer` as real actions. Explicitly forbids routing trade-shaped inputs to `give`, `speak`, or `emote`. Includes examples for the natural phrasings: `"buy the key from spark"`, `"can I purchase the cloak"`, `"I'll take 5 gold for my dagger"`, `"sell my cloak"`, `"price my cloak at 4 gold"`, `"offer the dagger for 3"`.

## Trade flow

The same flow underpins both buy and sell — the only difference is who plays each role. Let `B` be the buyer, `S` be the seller, `I` the item, `N` its `priceTag`.

### 1. Preconditions (deterministic)

In order, with explicit error messages on failure:

1. `B` and `S` are in the same room. Failure: `"<S.label> isn't here."`
2. `I.owner === S`. Failure: `"<S.label> doesn't have <I.label>."`
3. `I.priceTag !== null && I.priceTag > 0`. Failure (buy direction): `"The <I.label> isn't for sale."` Failure (sell direction): `"You haven't priced the <I.label>. Use 'offer <item> for <N> gold' first."`
4. `B.gold >= N`. Failure: `"You can't afford it — you have <B.gold> gold and <S.label> wants <N>."` (buy) / `"<S.label> only has <S.gold> gold."` (sell).

Each precondition fails fast with no state change, no LLM call, no event.

### 2. Consent — `tradeDecide` LLM call

Prompt is small and focused. Inputs:

- Seller persona: `label`, `shortDescription`, `longDescription`, `mood`, `goal`, `tags`.
- Buyer persona: `label`, `shortDescription`.
- Item: `label`, `shortDescription`, `longDescription`, `tags`.
- Offered price: `N` (the `priceTag`).
- Seller's current `gold` (so they know whether they can/should sell — useful for in-character flavour like a beggar accepting any price).
- Whether this is a buy (player is buyer) or sell (player is seller) — a `direction` field so the LLM frames the narration correctly.

Strict-mode JSON schema:

```ts
{
  type: 'object',
  additionalProperties: false,
  required: ['accept', 'narration'],
  properties: {
    accept: { type: 'boolean' },
    narration: { type: 'string' },
  },
}
```

The `narration` is the seller's in-character response — used as the render whether accepted or refused.

### 3. On accept (atomic)

Inside `repo.transaction`:

- `B.gold -= N`
- `S.gold += N`
- `I.owner = { kind: OwnerKind.Agent, id: B.id }`
- `I.priceTag = null` (new owner must re-`offer` to resell)

Emit `EventKind.Trade` with `{ buyerId, sellerId, itemId, price, accepted: true }`. Witnesses = everyone in the room. Render to actor: the LLM `narration`. Observers see the same narration (it's the seller's voice, not the buyer's private experience).

### 4. On refusal

No state change. Append `EventKind.Trade` with `accepted: false` and the same payload. Render is the LLM's narration. The refusal still goes through witness routing so onlookers (and the buyer / seller's own memory) know it happened — useful context for follow-up turns.

### 5. Sell symmetry

`sell X to Y`: buyer is the NPC (`Y`), seller is the player. Same preconditions, same consent prompt with role labels swapped, same Trade event with `buyerId=Y.id`, `sellerId=player.id`. NPC must have `gold >= priceTag` — that check runs before the LLM call.

## Admin UI

### `ItemForm` — metadata column

- A `For sale` checkbox. When checked, reveals a `Price (gold)` numeric input. When unchecked, `priceTag` is `null` on save. The input only renders when the checkbox is on; clearing the checkbox preserves the last-typed number in component state until save (so toggling off/on doesn't lose what was typed).

### `AgentForm` — metadata column

- A `Gold` numeric input alongside the existing HP / Capacity / Damage / Defense grid. Authored starting balance. No validation beyond `>= 0`.

### Inventory render

Wherever an agent's inventory is rendered as `label` (admin item list, in-game `inventory` command, "items at this location" lists), append ` (Ngp)` when `priceTag !== null`. Example: `brass key (5gp), cloak`. Same suffix appears in the in-game `look <agent>` output so the player can see what's purchasable.

## Tests

- **parser.test** — `buy/sell/offer` cases, plus missing-arg / no-such-target / ambiguous edge cases, plus the `for <N>` numeric parse.
- **actions/buy.test** — same-room precondition; seller-doesn't-own; not-priced; insufficient-funds; happy path (gold and item swap, `priceTag` clears, Trade event with `accepted=true`); refusal (no state change, Trade event with `accepted=false`, narration from stub LLM).
- **actions/sell.test** — symmetric to buy (buyer is NPC).
- **actions/offer.test** — sets `priceTag` on a held item; rejects when actor doesn't own the item; rejects `N <= 0`; rejects non-integer prices.
- **tradeDecide.test** — stub LLM returns shaped payload; validator rejects malformed responses (missing `accept`, missing `narration`, wrong types).
- **templates.test / inventory render** — tagged items render with `(Ngp)` suffix; un-tagged items render normally.
- **builder upsert** — accepts new fields end-to-end through snapshot save/load; legacy snapshots coerce defaults.

## File touch list

Domain / schema:
- `src/infra/schema.ts`
- `drizzle/0013_currency.sql`
- `src/core/domain/entities.ts`
- `src/core/domain/builder-types.ts`
- `src/core/domain/actions.ts`
- `src/core/domain/kinds.ts` (add `ActionKind.Buy`, `ActionKind.Sell`, `ActionKind.Offer`, `EventKind.Trade`)
- `src/core/domain/events.ts`

Builder / persistence:
- `src/core/builder/index.ts` (snapshot copy paths)
- `src/infra/builder-memory-repository.ts`
- `src/infra/builder-sqlite-repository.ts`
- `src/infra/memory-repository.ts`
- `src/infra/sqlite-repository.ts`

Engine:
- `src/core/engine/repository.ts` (add `setAgentGold(id, value)` and `setItemPriceTag(id, value)`)
- `src/core/engine/parser.ts`
- `src/core/engine/templates.ts` (price-tag suffix in `list(items)`)
- `src/core/engine/actions/buy.ts` (new)
- `src/core/engine/actions/sell.ts` (new)
- `src/core/engine/actions/offer.ts` (new)
- `src/core/engine/actions/registry.ts`
- `src/core/engine/trade-decide.ts` (new — the LLM consent call)
- `src/core/engine/llm-interpret.ts`
- `src/core/engine/llm-output.ts` (schema additions)
- `src/core/engine/llm-prompt.ts` (new sections for buy/sell/offer)

Engine integrations:
- `src/core/engine/tick.ts` — observer render for Trade events
- `src/core/engine/consequences.ts` — event summary for Trade
- `src/core/engine/narrate.ts` — memory summary for Trade
- `src/core/engine/npc-mind.ts` — NPC memory summary for Trade

Admin:
- `app/routes/admin/-components/ItemForm.tsx` — `For sale` checkbox + `Price` input
- `app/routes/admin/-components/AgentForm.tsx` — `Gold` numeric input

Tests: matching files under each directory above, plus new `buy.test.ts`, `sell.test.ts`, `offer.test.ts`, `trade-decide.test.ts`.
