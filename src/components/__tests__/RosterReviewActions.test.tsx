import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
import RosterReviewActions from '../RosterReviewActions';
it('renders labeled inline review controls and explains re-sync after rejection', () => {
  const html = renderToStaticMarkup(<RosterReviewActions playerId="p1" expectedUpdatedAt="2026-09-20T10:00:00.000Z" status={{ kind: 'LOAN', destinationNameHe: 'יעד', effectiveDate: '2026-09-01', confidence: 'REVIEW' }} />);
  for (const text of ['אישור', 'שמירת עריכה', 'דחייה', 'יעד', 'תאריך', 'בסנכרון הבא']) expect(html).toContain(text);
});
