import { buildAdminAttentionItems } from '@/lib/admin-overview';

describe('buildAdminAttentionItems', () => {
  it('shows only actionable queues and routes each to its workflow', () => {
    expect(buildAdminAttentionItems({ failedJobs: 2, pendingMerges: 0, pendingArchiveItems: 1, upcomingGamesMissingVenue: 0 })).toEqual([
      { id: 'failed-jobs', count: 2, label: 'עבודות סנכרון נכשלו', href: '/admin?adminTab=data' },
      { id: 'archive-review', count: 1, label: 'פריטי ארכיון ממתינים לבדיקה', href: '/admin/archive' },
    ]);
  });

  it('returns an empty queue when the dashboard needs no attention', () => {
    expect(buildAdminAttentionItems({ failedJobs: 0, pendingMerges: 0, pendingArchiveItems: 0, upcomingGamesMissingVenue: 0 })).toEqual([]);
  });
});
