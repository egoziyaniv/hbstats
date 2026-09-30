function isPreviewValue(value: unknown): value is { new: unknown } {
  return Boolean(
    value
    && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, 'new')
  );
}

function normalizeComparable(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalizeComparable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeComparable(nested)])
    );
  }
  return value;
}

function comparable(value: unknown): string {
  return JSON.stringify(normalizeComparable(value));
}

export function normalizeAppliedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) => {
      if (key.startsWith('_')) return [];
      return [[key, isPreviewValue(value) ? value.new : value]];
    })
  );
}

export function rowMatchesAppliedFields(
  row: Record<string, unknown>,
  fields: Record<string, unknown>
): boolean {
  return Object.entries(fields).every(
    ([key, expected]) => comparable(row[key]) === comparable(expected)
  );
}
