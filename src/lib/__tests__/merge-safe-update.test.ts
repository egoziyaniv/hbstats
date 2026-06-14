import { fieldMatchesPreview, buildSafeUpdate } from '@/lib/merge-engine';

describe('fieldMatchesPreview (merge optimistic concurrency)', () => {
  it('applies when current DB value still matches the preview baseline', () => {
    expect(fieldMatchesPreview(0, { old: 0, new: 5 })).toBe(true);
    expect(fieldMatchesPreview('x', { old: 'x', new: 'y' })).toBe(true);
  });

  it('skips when the value changed since preview (would clobber fresh data)', () => {
    expect(fieldMatchesPreview(3, { old: 0, new: 5 })).toBe(false);
    expect(fieldMatchesPreview('fresh', { old: null, new: 'scraped' })).toBe(false);
  });

  it('treats null/undefined/empty-string as equivalent emptiness', () => {
    expect(fieldMatchesPreview(null, { old: undefined, new: 1 })).toBe(true);
    expect(fieldMatchesPreview(undefined, { old: null, new: 1 })).toBe(true);
  });

  it('keeps legacy behaviour (apply) when no `old` baseline was recorded', () => {
    expect(fieldMatchesPreview(999, { new: 5 } as any)).toBe(true);
  });
});

describe('buildSafeUpdate', () => {
  it('includes only fields whose live value still matches the preview baseline', () => {
    const original = { goals: 0, assists: 4, yellowCards: 1 };
    const fields = {
      goals: { old: 0, new: 7 },       // unchanged → apply
      assists: { old: 0, new: 9 },     // changed since preview (now 4) → skip
      yellowCards: { old: 1, new: 2 }, // unchanged → apply
    };
    const { updateData, originalFields, skipped } = buildSafeUpdate(original, fields);
    expect(updateData).toEqual({ goals: 7, yellowCards: 2 });
    expect(originalFields).toEqual({ goals: 0, yellowCards: 1 });
    expect(skipped).toEqual(['assists']);
  });

  it('skips underscore pseudo-fields when asked', () => {
    const { updateData } = buildSafeUpdate(
      { homeScore: 1 },
      { homeScore: { old: 1, new: 2 }, _events: { old: null, new: [] } },
      { skipUnderscore: true },
    );
    expect(updateData).toEqual({ homeScore: 2 });
    expect(updateData).not.toHaveProperty('_events');
  });

  it('returns empty updateData when every field changed since preview', () => {
    const { updateData } = buildSafeUpdate({ a: 9 }, { a: { old: 0, new: 1 } });
    expect(Object.keys(updateData)).toHaveLength(0);
  });
});
