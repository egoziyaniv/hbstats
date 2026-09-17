import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ClubCalendarPage from '@/app/club/calendar/page';
import { CLUB_CALENDAR_URL } from '@/lib/club-calendar';

it('provides subscription links, a selectable canonical URL and honest refresh guidance', () => {
  const html = renderToStaticMarkup(<ClubCalendarPage />);
  expect(html).toContain('webcal://statsai.co.il/api/calendar/hapoel-beer-sheva.ics');
  expect(html).toContain('https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(CLUB_CALENDAR_URL));
  expect(html).toContain('value="' + CLUB_CALENDAR_URL + '"');
  expect(html).toContain('מספר שעות');
  expect(html).toContain('מועד לא נקבע');
});
