import type { StatQuestion } from './types';
import {
  recordResolver, recordLeaderboardResolver, clubTopScorerResolver, leagueTopScorerResolver,
  clubTopOpponentResolver, clubHonorsResolver, mostTitlesResolver, mostStateCupsResolver,
  clubBestSeasonResolver, allTimeLeaderResolver, biggestRivalriesResolver, h2hRivalResolver,
} from './resolvers';

const club = (id: string, titleHe: string, cardType: StatQuestion['cardType'], resolve: StatQuestion['resolve'], extra: Partial<StatQuestion> = {}): StatQuestion =>
  ({ id, scope: 'club', needsClub: true, cardType, titleHe: () => titleHe, resolve, ...extra });
const league = (id: string, titleHe: string, cardType: StatQuestion['cardType'], resolve: StatQuestion['resolve']): StatQuestion =>
  ({ id, scope: 'league', needsClub: false, cardType, titleHe: () => titleHe, resolve });

export const REGISTRY: StatQuestion[] = [
  club('club_top_scorer', 'מלך השערים בכל הזמנים', 'leaderboard', clubTopScorerResolver),
  club('club_unbeaten', 'הרצף הארוך ביותר בלי הפסד', 'hero', recordResolver('longest_unbeaten_streak', 'hero', 'none')),
  club('club_win_streak', 'רצף הניצחונות הארוך ביותר', 'hero', recordResolver('longest_win_streak', 'hero', 'none')),
  club('club_biggest_win', 'הניצחון הכי גדול', 'hero', recordResolver('biggest_win', 'hero', 'game')),
  club('club_top_opponent', 'היריבה הכי תכופה + מאזן', 'leaderboard', clubTopOpponentResolver),
  club('club_h2h_rival', 'מאזן מול יריבה', 'leaderboard', h2hRivalResolver, { needsRival: true }),
  club('club_honors', 'תארים והישגים', 'leaderboard', clubHonorsResolver),
  club('club_best_season', 'העונה הכי טובה', 'hero', clubBestSeasonResolver),
  league('league_most_titles', 'הכי הרבה אליפויות', 'leaderboard', mostTitlesResolver),
  league('league_top_scorer', 'מלך השערים ההיסטורי', 'leaderboard', leagueTopScorerResolver),
  league('league_biggest_win', 'הניצחון הכי גדול אי פעם', 'hero', recordResolver('biggest_win', 'hero', 'game')),
  league('league_unbeaten', 'הרצף הכי ארוך בלי הפסד', 'hero', recordResolver('longest_unbeaten_streak', 'hero', 'none')),
  league('league_most_state_cups', 'הכי הרבה גביעי מדינה', 'leaderboard', mostStateCupsResolver),
  league('league_all_time_leader', 'מובילת טבלת כל-הזמנים', 'leaderboard', allTimeLeaderResolver),
  league('league_biggest_rivalries', 'היריבויות הגדולות', 'leaderboard', biggestRivalriesResolver),
  league('league_youngest_scorer', 'המבקיע הצעיר ביותר (מ-2006)', 'hero', recordResolver('youngest_scorer', 'hero', 'player')),
  league('league_most_goals_game', 'הכי הרבה שערים למשחק (שחקן)', 'leaderboard', recordLeaderboardResolver('most_goals_player_game', 'player')),
];

export function getQuestion(id: string): StatQuestion | undefined {
  return REGISTRY.find((q) => q.id === id);
}
