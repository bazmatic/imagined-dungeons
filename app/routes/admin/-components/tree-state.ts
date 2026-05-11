export function makeKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export function isExpanded(set: ReadonlySet<string>, key: string): boolean {
  return set.has(key);
}

export function toggleNode(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
