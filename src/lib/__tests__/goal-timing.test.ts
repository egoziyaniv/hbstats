jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { team: {findUnique: jest.fn()}, $queryRaw: jest.fn() } }));
import prisma from '@/lib/prisma';
import { buildGoalTimingForTeam } from '@/lib/goal-timing';

it('uses linked team IDs, reverses own goals and skips unresolved legacy labels', async () => {
  (prisma.team.findUnique as jest.Mock).mockResolvedValue({id:'A', nameHe:'קבוצה א', nameEn:'Team A', seasonId:'s'});
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([
    {minute:10, type:'GOAL', team_id:'A', event_team:'different spelling', home_team_id:'A', away_team_id:'B'},
    {minute:10, type:'OWN_GOAL', team_id:'B', event_team:'B', home_team_id:'A', away_team_id:'B'},
    {minute:10, type:'OWN_GOAL', team_id:'A', event_team:'A', home_team_id:'A', away_team_id:'B'},
    {minute:10, type:'GOAL', team_id:null, event_team:'unknown', home_team_id:'A', away_team_id:'B'},
  ]);
  const rows = await buildGoalTimingForTeam('A');
  expect(rows[0]).toMatchObject({scored:2, conceded:1});
  expect((prisma.$queryRaw as jest.Mock).mock.calls[0][0].join('')).toContain("'OWN_GOAL'");
});
