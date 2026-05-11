export function sanitizeTag(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return trimmed === '' ? null : trimmed;
}

export function addTag(tags: readonly string[], raw: string): readonly string[] {
  const t = sanitizeTag(raw);
  if (t === null) return tags;
  if (tags.includes(t)) return tags;
  return [...tags, t];
}

export function removeTag(tags: readonly string[], tag: string): readonly string[] {
  return tags.filter((t) => t !== tag);
}
