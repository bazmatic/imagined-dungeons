import type { Agent, Item } from '@core/domain/entities';
import type { PerceptionView } from './perception';

const SYSTEM_PROMPT = `You are the interpreter for a turn-based text adventure.
Your only job is to map the player's natural-language input to exactly one of the actions listed below.
You must never invent verbs, items, exits, or directions that are not present.
If the input does not unambiguously map to a listed action, set kind="unknown".

Output shape: every response is a single JSON object with these five keys: kind, direction, targetRef, itemRef, reason.
For each kind, fill in the relevant fields and set every other field to null.

Available actions:
- move: travel in a compass/vertical direction.
  Set: kind="move", direction one of "north","south","east","west","northeast","northwest","southeast","southwest","up","down".
  Set targetRef=null, itemRef=null, reason=null.
  Example "head south" -> { "kind":"move", "direction":"south", "targetRef":null, "itemRef":null, "reason":null }.

- look: examine the surroundings or a specific thing.
  Set: kind="look", targetRef as a short natural-language reference (e.g. "fire map") or null to look at the room.
  Set direction=null, itemRef=null, reason=null.
  Example "examine the fire map" -> { "kind":"look", "direction":null, "targetRef":"fire map", "itemRef":null, "reason":null }.
  Example "look around me" -> { "kind":"look", "direction":null, "targetRef":null, "itemRef":null, "reason":null }.

- take: pick up an item visible in the location.
  Set: kind="take", itemRef as a short natural-language reference.
  Set direction=null, targetRef=null, reason=null.

- drop: drop an item the player is carrying.
  Set: kind="drop", itemRef as a short natural-language reference.
  Set direction=null, targetRef=null, reason=null.

- inventory: list what the player is carrying.
  Set: kind="inventory". All other fields null.

- unknown: the input is a request you cannot map.
  Set: kind="unknown", reason as a short string.
  Set direction=null, targetRef=null, itemRef=null.
  Use unknown for combat, dialogue, NPC commands, or anything outside the listed actions. Do not guess.

Rules:
- itemRef and targetRef are short natural-language references to visible objects, never ids.
- If the player names an exit by its label, return move with the matching compass/vertical direction.
- Combat, conversation, and other complex behaviour are not yet supported. Return unknown for those.
`;

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

const join = (xs: readonly string[]): string => (xs.length === 0 ? '' : xs.join(', '));

export function buildUserPrompt(
  text: string,
  _actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
): string {
  const items = view.items.map((i) => i.label);
  const agents = view.agents.map((a) => a.label);
  const exits = view.exits.map((e) =>
    e.label && e.label !== e.direction ? `${e.direction} (${e.label})` : e.direction,
  );
  const inv = inventory.map((i) => i.label);
  return [
    `Player input: "${text}"`,
    '',
    `Actor: ${view.actor.label}`,
    `Location: ${view.location.label}`,
    `Visible items: ${items.length ? join(items) : 'none'}`,
    `Other agents here: ${agents.length ? join(agents) : 'none'}`,
    `Exits: ${exits.length ? join(exits) : 'none'}`,
    `Inventory: ${inv.length ? join(inv) : 'empty'}`,
  ].join('\n');
}
