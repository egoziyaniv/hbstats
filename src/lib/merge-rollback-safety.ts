function isPreviewValue(value: unknown): value is { new: unknown } {
  return Boolean(
    value
    && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, 'new')
  );
}

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (value === undefined) return null;
  return value;
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
