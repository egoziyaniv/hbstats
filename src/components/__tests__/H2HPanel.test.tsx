import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { H2HPanel } from '@/components/H2HPanel';

test('names the winner in a historical meeting instead of only showing the first-team result', () => {
  const html = renderToStaticMarkup(<H2HPanel summary={{
    teamAId: 'tiberias', teamBId: 'beer-sheva', teamAName: 'עירוני טבריה', teamBName: 'הפועל באר שבע',
    totalGames: 1, winsA: 0, draws: 0, winsB: 1, goalsA: 0, goalsB: 7,
    meetings: [{ gameId: 'game', date: '2025-08-30', competitionNameHe: null, homeTeamName: 'הפועל באר שבע', awayTeamName: 'עירוני טבריה', homeScore: 7, awayScore: 0, isAHome: false, resultFromA: 'L' }],
  }} />);
  expect(html).toContain('ניצחון הפועל באר שבע');
});
