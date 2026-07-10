// shared/types/mobile-api.ts
// Single source of truth for HBStats mobile API JSON contracts.
// Both backend handlers and mobile clients import from here.

import type {
  SafeUser,
  TeamSummary,
  TeamHeader,
  PlayerSummary,
  MatchCard,
  MatchStatus,
  NewsCard,
  StandingRow,
} from './common';

// Re-export domain primitives so consumers can import everything from @shared/types/mobile-api.
export type {
  TeamSummary,
  TeamHeader,
  PlayerSummary,
  MatchCard,
  MatchStatus,
  NewsCard,
  StandingRow,
} from './common';

// ---------- Auth ----------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// /auth/logout: no body, no response payload.
// /auth/logout-all: no body, no response payload.

// ---------- Errors ----------

export interface ApiError {
  error: string;
  code?: string;
}

// ---------- Home ----------

export interface LiveMatchCompact {
  id: string;
  minute: number | null;
  home: { name: string; score: number | null };
  away: { name: string; score: number | null };
}

export interface CompactStandingRow {
  rank: number;
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  played: number;
  goalsDiff: number;
  points: number;
  form: string;   // last 5 results, newest first ("נננתה")
}

// Stats tab — top scorers / assisters / yellow / red cards leaderboards.
export interface StatsLeaderEntry {
  rank: number;
  playerId: string | null;
  playerNameHe: string;
  playerNameEn: string | null;
  teamNameHe: string;
  teamNameEn: string | null;
  value: number;
  gamesPlayed: number | null;
  photoUrl: string | null;
}

export interface StatsCategories {
  topScorers: StatsLeaderEntry[];
  topAssists: StatsLeaderEntry[];
  topYellowCards: StatsLeaderEntry[];
  topRedCards: StatsLeaderEntry[];
}

export interface StatsPayload {
  season: { id: string; year: number; name: string } | null;
  competition: { id: string; nameHe: string; nameEn: string } | null;
  categories: StatsCategories;
}

// Standings tab — full Israeli Premier League table, optionally split into
// championship / relegation playoff groups.
export interface StandingsRow {
  position: number;
  teamId: string;
  teamNameHe: string;
  teamNameEn: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;           // adjusted point total (raw points + deduction)
  pointsAdjustment: number; // negative when points were deducted
  pointsAdjustmentNoteHe: string | null;
  form: string;             // last 5 results, newest first ("נננתה")
  groupNameEn: string | null;
}

export interface StandingsGroup {
  label: string;            // "ליגת העל" or "קבוצת אליפות"/"קבוצת ירידה"
  rows: StandingsRow[];
}

// Scope of the standings table: overall, home legs only, or away legs only.
export type StandingsScope = 'all' | 'home' | 'away';

export interface StandingsPayload {
  season: { id: string; year: number; name: string } | null;
  scope?: StandingsScope; // optional: older clients ignore it
  groups: StandingsGroup[];
}

// ---------- Seasons list (for global season picker) ----------

export interface SeasonOption {
  id: string;
  year: number;
  name: string;
  gameCount: number;
}

export interface SeasonsPayload {
  seasons: SeasonOption[];
}

// ---------- News (full list screen) ----------

export interface NewsSource {
  slug: string;
  label: string;
  teamLabel: string | null;
}

export interface NewsPayload {
  updatedAt: string;
  sources: NewsSource[];
  items: NewsCard[];
}

// ---------- Predictions (full list screen) ----------

export interface PredictionItem {
  gameId: string;
  competition: string;
  homeTeam: { id: string; nameHe: string; logoUrl: string | null };
  awayTeam: { id: string; nameHe: string; logoUrl: string | null };
  dateTime: string;
  winnerName: string | null;     // למשל "הפועל באר שבע"
  winnerCommentHe: string | null; // משפט קצר
  adviceHe: string | null;       // המלצת הימור
  underOver: string | null;      // למשל "+2.5"
  percentHome: number | null;    // 0-100
  percentDraw: number | null;
  percentAway: number | null;
}

export interface PredictionsPayload {
  season: { id: string; year: number; name: string } | null;
  items: PredictionItem[];
}

export interface HomePayload {
  user: { id: string; name: string; avatarUrl: string | null } | null;
  favoriteTeam: TeamSummary | null;
  nextMatch: MatchCard | null;
  lastMatch: MatchCard | null;
  compactStandings: CompactStandingRow[];
  liveStrip: LiveMatchCompact[];
  newsStrip: NewsCard[];
}

// ---------- Live ----------

export interface LiveMatchEvent {
  minute: number;
  type: 'goal' | 'yellow' | 'red' | 'sub' | 'penalty';
  player: string | null;
  team: 'home' | 'away';
}

export interface LiveMatchExpanded {
  id: string;
  minute: number | null;
  status: MatchStatus;
  home: { team: TeamSummary; score: number | null };
  away: { team: TeamSummary; score: number | null };
  eventCount: number;
  recentEvents: LiveMatchEvent[];
}

export interface LiveLeagueGroup {
  league: { id: string; nameHe: string; nameEn: string; logo: string | null };
  matches: LiveMatchExpanded[];
}

export interface LivePayload {
  groups: LiveLeagueGroup[];
  lastUpdated: string;
}

// ---------- Match ----------

export interface MatchEvent extends LiveMatchEvent {
  id: string;
  assistPlayer: string | null;
}

export interface LineupPlayer {
  player: PlayerSummary;
  isStarting: boolean;
  position: string | null;
  rating: number | null; // 0-10 Flashscore per-match performance rating
}

export interface Lineup {
  formation: string | null;
  players: LineupPlayer[];
  coach?: {
    id: string | null;
    name: string;
    nameHe: string | null;
    photoUrl: string | null;
  } | null;
}

export interface MatchPlayerStats {
  apiFootballPlayerId: number;
  playerId: string | null;
  name: string | null;
  rating: number | null;
  minutes: number | null;
  position: string | null;
  captain: boolean;
  substitute: boolean;
  goals: number | null;
  assists: number | null;
  shots: { total: number | null; on: number | null };
  passes: { total: number | null; key: number | null; accuracy: number | null };
  tackles: { total: number | null; interceptions: number | null };
  duels: { total: number | null; won: number | null };
  dribbles: { attempts: number | null; success: number | null };
  fouls: { drawn: number | null; committed: number | null };
  cards: { yellow: number | null; red: number | null };
}

export interface GamePlayerStatsPayload {
  gameId: string;
  players: MatchPlayerStats[];
}

// ---------- Player match history (per-game stats over the last N matches) ----------

export interface PlayerMatchHistoryEntry {
  gameId: string;
  date: string;
  opponent: string;
  scoreLine: string;
  rating: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  shotsOn: number | null;
  shotsTotal: number | null;
  passesKey: number | null;
  duelsWon: number | null;
  duelsTotal: number | null;
}

export interface PlayerMatchHistoryPayload {
  playerId: string;
  entries: PlayerMatchHistoryEntry[];
}

// ---------- Team extras (coach history + recent injuries) ----------

export interface CoachAssignment {
  id: string;
  nameHe: string | null;
  nameEn: string;
  seasonName: string;
  startDate: string | null;
  endDate: string | null;
}

export interface CoachTenureSummary {
  name: string;
  photoUrl: string | null;
  firstMatch: string;
  lastMatch: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
}

export interface SeasonCoachGroupSummary {
  seasonId: string;
  seasonName: string;
  year: number;
  coaches: CoachTenureSummary[];
}

export interface TeamInjury {
  id: string;
  playerName: string | null;
  reason: string | null;
  date: string | null;
}

export interface CoachChartEntrySummary {
  coachKey: string;
  displayName: string;
  photoUrl: string | null;
  seasonName: string;
  year: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
  pointsPerGame: number;
}

export interface GoalTimingBucketSummary {
  label: string;
  rangeStart: number;
  rangeEnd: number;
  scored: number;
  conceded: number;
}

export interface TeamExtrasPayload {
  teamId: string;
  coaches: CoachAssignment[];
  coachTimeline: SeasonCoachGroupSummary[];
  injuries: TeamInjury[];
  coachChart: CoachChartEntrySummary[];
  goalTiming: GoalTimingBucketSummary[];
}

// ---------- Advanced leaderboards (key passes, duels, dribbles) ----------

export type AdvancedMetric = 'passesKey' | 'duelsWon' | 'dribblesSuccess';

export interface AdvancedLeaderboardEntry {
  canonicalId: string;
  name: string;
  team: string;
  value: number;
  matches: number;
}

export interface AdvancedLeaderboardsPayload {
  season: { id: string; year: number; name: string };
  keyPasses: AdvancedLeaderboardEntry[];
  duelsWon: AdvancedLeaderboardEntry[];
  dribblesSuccess: AdvancedLeaderboardEntry[];
}

export interface MatchStats {
  possession: { home: number; away: number } | null;
  shots: { home: number; away: number } | null;
  shotsOnTarget: { home: number; away: number } | null;
  corners: { home: number; away: number } | null;
  fouls: { home: number; away: number } | null;
  yellowCards: { home: number; away: number } | null;
  redCards: { home: number; away: number } | null;
  offsides: { home: number; away: number } | null;
  xg: { home: number; away: number } | null;
}

export interface H2H {
  lastN: MatchCard[];
  wins: { home: number; away: number; draw: number };
}

export interface PredictedLineupPlayerSummary {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  position: string | null;
  posCategory: 'GK' | 'DEF' | 'MID' | 'FWD';
  jerseyNumber: number | null;
  startsInLast5: number;
  totalGamesConsidered: number;
}

export interface SofascoreMatchStat {
  section: string;        // English section key — translated client-side
  label: string;          // English label — translated client-side
  home: string;
  away: string;
  homeExtra: string | null;
  awayExtra: string | null;
}

export interface MatchPayload {
  match: {
    id: string;
    status: MatchStatus;
    minute: number | null;
    score: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null } | null;
    dates: { kickoff: string; finished: string | null };
    venue: { name: string; city: string | null } | null;
    referee: string | null;
    awarded?: { winnerTeamId: string; noteHe: string } | null;
  };
  homeTeam: TeamHeader;
  awayTeam: TeamHeader;
  events: MatchEvent[];
  lineups: { home: Lineup; away: Lineup };
  matchStats: MatchStats | null;
  sofascoreStats: SofascoreMatchStat[];
  h2h: H2H | null;
  predicted: { home: PredictedLineupPlayerSummary[]; away: PredictedLineupPlayerSummary[] } | null;
}

// ---------- Team ----------

export interface TeamSeasonStats {
  goalsScored: number;
  goalsAgainst: number;
  cleanSheets: number;
  averageGoalsScored: number;
  averageGoalsAgainst: number;
  topScorer: { player: PlayerSummary; goals: number } | null;
}

export interface TeamPayload {
  team: TeamHeader;
  coach: { name: string; since: string | null } | null;
  standingsContext: { rank: number; points: number; around: StandingRow[] } | null;
  nextMatch: MatchCard | null;
  lastMatch: MatchCard | null;
  recentForm: ('W' | 'D' | 'L')[];
  squad: { position: string; players: PlayerSummary[] }[];
  seasonStats: TeamSeasonStats;
}

// ---------- Player (basic, v1.0) ----------

export interface PlayerSeasonStats {
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  subbedIn: number;
  subbedOut: number;
}

export interface PlayerRecentMatch {
  matchId: string;
  opponent: string;
  date: string;
  role: 'started' | 'subbed_in' | 'unused' | 'subbed_out';
  contribution: { goals: number; assists: number; minutes: number };
}

export interface PlayerCareerEntry {
  season: string;          // "2023/2024"
  team: string | null;
  competition: string | null;
  rating: number | null;   // Flashscore average match rating
  apps: number | null;
  goals: number | null;
  assists: number | null;
  yellow: number | null;
  red: number | null;
}

export interface PlayerProfile {
  id: string;
  nameHe: string;
  nameEn: string;
  photoUrl: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  position: string | null;
  marketValue: string | null;     // e.g. "€1.2m" — sourced from Flashscore
  contractUntil: string | null;   // ISO date — sourced from Flashscore
  aiOverview: {
    text: string | null;
    wikiSummary: string | null;
    wikiThumbnail: string | null;
    wikiSourceUrl: string | null;
  } | null;
}

export interface PlayerTrophyDetail {
  seasonLabel: string;
  kind: 'win' | 'runner-up';
  teamName: string | null;
}

export interface PlayerTrophyGroup {
  leagueNameHe: string;
  countryHe: string | null;
  countryEn: string | null;
  wins: number;
  runnerUps: number;
  seasonsWon: string[];
  details: PlayerTrophyDetail[];
}

export interface PlayerPayload {
  player: PlayerProfile;
  currentTeam: TeamSummary | null;
  currentSeasonStats: PlayerSeasonStats | null;
  recentMatches: PlayerRecentMatch[];
  career: PlayerCareerEntry[];
  trophies: PlayerTrophyGroup[];
}

// ---------- Preferences ----------

export interface PreferenceTeamOption {
  id: string;
  apiFootballId: number | null;
  name: string;
  logoUrl: string | null;
}

export interface PreferenceCompetitionOption {
  id: string;
  apiFootballId: number | null;
  name: string;
  country: string | null;
}

export interface NotificationPreferences {
  goals: boolean;
  results: boolean;
  reminders: boolean;
  news: boolean;
}

export interface PreferencesPayload {
  favoriteTeamApiIds: number[];
  favoriteCompetitionApiIds: number[];
  notifications: NotificationPreferences;
  availableTeams: PreferenceTeamOption[];
  availableCompetitions: PreferenceCompetitionOption[];
}
