export function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) =>
        typeof item === 'string' ? item.trim() : String(item).trim(),
      )
      .filter((item) => item.length > 0);
    return normalized.length > 0 ? normalized : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : undefined;
  }
  const fallback = String(value).trim();
  return fallback ? [fallback] : undefined;
}

export function toNumberArray(value: unknown): number[] | undefined {
  const asStrings = toStringArray(value);
  if (!asStrings) return undefined;
  const parsed = asStrings
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
  return parsed.length > 0 ? parsed : undefined;
}
