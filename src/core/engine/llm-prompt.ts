import type { Agent, Item } from '@core/domain/entities';
import type { PerceptionView } from './perception';

const SYSTEM_PROMPT = `You are the interpreter for a turn-based text adventure.
Your only job is to map the player's natural-language input to exactly one of the actions listed below.
You must never invent verbs, items, exits, agents, or directions that are not present.
If the input does not unambiguously map to a listed action, set kind="unknown".

Output shape: every response is a single JSON object with these eight keys: kind, direction, targetKind, targetRef, itemRef, targetAgentRef, utterance, reason.
For each kind, fill in the relevant fields and set every other field to null.

Available actions:
- move: travel in a compass/vertical direction.
  Set: kind="move", direction one of "north","south","east","west","northeast","northwest","southeast","southwest","up","down".
  All other fields null.
  Example "head south" -> { "kind":"move", "direction":"south", "targetKind":null, "targetRef":null, "itemRef":null, "targetAgentRef":null, "utterance":null, "reason":null }.

- look: examine something around you. The target can be the room, an item, another character, or an exit.
  Set: kind="look".
    - To look at the room: targetKind="room" (or null) and targetRef=null.
    - To look at an item: targetKind="item", targetRef as a short natural-language reference (e.g. "fire map").
    - To look at a person/agent: targetKind="agent", targetRef as their name (e.g. "Spark").
    - To look at an exit/door: targetKind="exit", targetRef as the exit's label or direction (e.g. "tavern back door", "north").
  All other fields null.
  Example "look around me" -> { "kind":"look", "direction":null, "targetKind":"room", "targetRef":null, "itemRef":null, "targetAgentRef":null, "utterance":null, "reason":null }.
  Example "examine the fire map" -> { "kind":"look", "direction":null, "targetKind":"item", "targetRef":"fire map", "itemRef":null, "targetAgentRef":null, "utterance":null, "reason":null }.
  Example "look at Spark" -> { "kind":"look", "direction":null, "targetKind":"agent", "targetRef":"Spark", "itemRef":null, "targetAgentRef":null, "utterance":null, "reason":null }.
  Example "examine the locked door" -> { "kind":"look", "direction":null, "targetKind":"exit", "targetRef":"locked door", "itemRef":null, "targetAgentRef":null, "utterance":null, "reason":null }.

- take: pick up an item visible in the location.
  Set: kind="take", itemRef as a short natural-language reference. All other fields null.

- drop: drop an item the player is carrying.
  Set: kind="drop", itemRef as a short natural-language reference. All other fields null.

- inventory: list what the player is carrying.
  Set: kind="inventory". All other fields null.

- speak: say something to another agent in the location.
  Set: kind="speak", targetAgentRef as a short natural-language reference to the agent, utterance as the words spoken.
  All other fields null.
  Example "talk to spark, hello" -> { "kind":"speak", "direction":null, "targetKind":null, "targetRef":null, "itemRef":null, "targetAgentRef":"spark", "utterance":"hello", "reason":null }.
  Example "tell the goblin to back off" -> { "kind":"speak", "direction":null, "targetKind":null, "targetRef":null, "itemRef":null, "targetAgentRef":"goblin", "utterance":"back off", "reason":null }.

- attack: attack another agent in the location.
  Set: kind="attack", targetAgentRef as a short natural-language reference to the agent.
  All other fields null.
  Example "attack the goblin" -> { "kind":"attack", "direction":null, "targetKind":null, "targetRef":null, "itemRef":null, "targetAgentRef":"goblin", "utterance":null, "reason":null }.
  Example "kill spark" -> { "kind":"attack", "direction":null, "targetKind":null, "targetRef":null, "itemRef":null, "targetAgentRef":"spark", "utterance":null, "reason":null }.

- unknown: the input is a request you cannot map.
  Set: kind="unknown", reason as a short string.
  All other fields null.
  Use unknown for actions outside the listed vocabulary. Do not guess.

Rules:
- itemRef, targetRef, and targetAgentRef are short natural-language references to visible objects, never ids.
- If the player names an exit by its label, return move with the matching compass/vertical direction.
- For speak, target only agents that are present in the location. Use unknown if no plausible target.
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
