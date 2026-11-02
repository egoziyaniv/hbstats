export type AdminAttentionCounts = {
  failedJobs: number;
  pendingMerges: number;
  pendingArchiveItems: number;
  upcomingGamesMissingVenue: number;
  /** Match-analysis drafts awaiting approval, and the editor page of the newest one. */
  pendingAnalyses?: { count: number; href: string };
};

export function buildAdminAttentionItems(counts: AdminAttentionCounts) {
  return [
    counts.failedJobs > 0 ? { id: 'failed-jobs', count: counts.failedJobs, label: 'עבודות סנכרון נכשלו', href: '/admin?adminTab=data' } : null,
    counts.pendingMerges > 0 ? { id: 'pending-merges', count: counts.pendingMerges, label: 'מיזוגים ממתינים לבדיקה', href: '/admin/merge' } : null,
    counts.pendingArchiveItems > 0 ? { id: 'archive-review', count: counts.pendingArchiveItems, label: 'פריטי ארכיון ממתינים לבדיקה', href: '/admin/archive' } : null,
    counts.pendingAnalyses && counts.pendingAnalyses.count > 0 ? { id: 'match-analysis', count: counts.pendingAnalyses.count, label: 'ניתוחי משחק ממתינים לאישור', href: counts.pendingAnalyses.href } : null,
    counts.upcomingGamesMissingVenue > 0 ? { id: 'missing-venue', count: counts.upcomingGamesMissingVenue, label: 'משחקים קרובים ללא אצטדיון', href: '/admin/games' } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
}
