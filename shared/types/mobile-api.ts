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

// ---------- Games (matches list screen) ----------

export interface GamesCompetitionOption {
  id: string;
  nameHe: string;
}

/** One round's fixtures/results (e.g. "מחזור 3"). */
export interface GamesRoundGroup {
  roundLabel: string;
  games: MatchCard[];
}

export interface GamesPayload {
  season: { id: string; year: number; name: string } | null;
  competitions: GamesCompetitionOption[];
  selectedCompetitionId: string | null;
  rounds: GamesRoundGroup[];
}

// ---------- Club hub (knowledge & history) ----------

export type HonorPlace = 'WINNER' | 'RUNNER_UP';

export interface ClubHonorGroup {
  competitionHe: string;
  winners: string[]; // season labels
  runnersUp: string[];
}

export type HallOfFameRole = 'PLAYER' | 'COACH' | 'LEGEND';

export interface HallOfFameItem {
  id: string;
  playerId: string | null;
  nameHe: string;
  role: HallOfFameRole;
  years: string | null;
  blurbHe: string | null;
  statLineHe: string | null;
  photoUrl: string | null;
}

export type ClubPageCategory = 'HISTORY' | 'STADIUM' | 'IDENTITY' | 'CULTURE';

export interface ClubPageSummary {
  slug: string;
  title: string;
  category: ClubPageCategory;
  heroImageUrl: string | null;
}

export interface ClubPageDetail extends ClubPageSummary {
  bodyHe: string;
}

export interface ClubHubPayload {
  honors: ClubHonorGroup[];
  totalTitles: number;
  hallOfFame: HallOfFameItem[];
  pages: ClubPageSummary[];
}

export interface ClubSeasonRow {
  seasonId: string;
  year: number;
  name: string;
  teamId: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  honors: string[];
}
export interface ClubSeasonsPayload {
  seasons: ClubSeasonRow[];
}

export interface VenueGameRow {
  id: string;
  dateISO: string;
  homeHe: string;
  awayHe: string;
  homeScore: number | null;
  awayScore: number | null;
  competitionHe: string;
  attendance: number | null;
}
export interface VenueStatsPayload {
  venue: { id: string; nameHe: string; cityHe: string | null; capacity: number | null; imageUrl: string | null };
  totalGames: number;
  bsRecord: { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number } | null;
  biggestWin: { gameId: string; scoreHe: string; opponentHe: string; dateISO: string } | null;
  attendance: { avg: number; max: number } | null;
  games: VenueGameRow[];
}

/** A player's real contribution in our data (shared by legends + chants). */
export interface PlayerContribution {
  photoUrl: string | null;
  position: string | null;
  goals: number;
  appearances: number;
}

export interface LegendDetail {
  id: string;
  nameHe: string;
  role: HallOfFameRole;
  years: string | null;
  statLineHe: string | null;
  blurbHe: string | null;
  photoUrl: string | null;
  videoEmbedUrl: string | null;
  playerId: string | null;
  /** Real contribution from our data when linked to a Player. */
  playerSummary: PlayerContribution | null;
}

// ---------- Songs (fan chants) ----------

export type SongType = 'STAND' | 'PLAYER' | 'STUDIO' | 'CHAMPIONSHIP';

export interface SongSummary {
  id: string;
  slug: string;
  type: SongType;
  titleHe: string;
  performerGroup: string | null;
  debutSeasonYear: number | null;
  thumbUrl: string | null;
  contentWarning: boolean;
  /** True when the song has lyrics stored (drives the "מילים" badge + search). */
  hasLyrics: boolean;
  player: { id: string; nameHe: string; photoUrl: string | null } | null;
}

export interface SongDetail extends SongSummary {
  /** The linked player's real stats, so a chant page can link through to them. */
  playerSummary: PlayerContribution | null;
  lyricsHe: string | null;
  chordsHe: string | null;
  originalMelody: string | null;
  originalMelodyUrl: string | null;
  videoEmbedUrls: string[];
}

export interface SongsPayload {
  songs: SongSummary[];
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

export interface OnThisDayHome {
  match: { gameId: string; yearsAgo: number; headline: string; competitionName: string | null } | null;
  birthdays: Array<{
    playerId: string;
    nameHe: string;
    age: number;
    currentTeam: { nameHe: string; logoUrl: string | null } | null;
  }>;
}

export interface HomePayload {
  user: { id: string; name: string; avatarUrl: string | null } | null;
  favoriteTeam: TeamSummary | null;
  nextMatch: MatchCard | null;
  lastMatch: MatchCard | null;
  compactStandings: CompactStandingRow[];
  liveStrip: LiveMatchCompact[];
  newsStrip: NewsCard[];
  onThisDay?: OnThisDayHome | null;
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
  /** Club honors ("ארון הגביעים") — null when the team has no resolvable club family. */
  honors: ClubHonorsApi | null;
  /** Club-scope RecordEntry rows ("שיאי המועדון"), grouped by category — top 3 each, empty categories omitted. */
  clubRecords: ClubRecordGroupApi[];
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

// FotMob-sourced rich match data (xG, shot map, momentum, player ratings,
// attendance/weather). All oriented to home/away (home attacks right in px).
export interface FotmobShot {
  isHome: boolean;
  player: string;
  min: number | null;
  outcome: string; // goal | save | miss | block | post
  xg: number | null;
  xgot: number | null;
  situation: string | null;
  shotType: string | null;
  px: number; // 0-100 left→right (home attacks right)
  py: number; // 0-100
}
export interface FotmobMomentumPoint { minute: number; value: number }
export interface FotmobGoalMarker { minute: number | null; isHome: boolean; player: string }
export interface FotmobPlayerRating {
  isHome: boolean;
  name: string;
  isGK: boolean;
  rating: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  xa: number | null;
  xgxa: number | null;
  shots: number | null;
  chancesCreated: number | null;
  defActions: number | null;
  /** Full per-category metric map (English label → value) for the stats table. */
  stats?: Record<string, number | string>;
}
/** One injured/suspended player from FotMob's "unavailable" block. */
export interface FotmobUnavailablePlayer {
  name: string;
  nameEn: string;
  playerId: string | null;
  fotmobId: number | null;
  type: 'injury' | 'suspension';
  expectedReturn: string | null;      // e.g. "Late September 2026"
  expectedReturnDate: string | null;  // ISO
  countryCode: string | null;
  age: number | null;
}
export interface FotmobMatchInfo {
  attendance?: number | null;
  stadium?: { name?: string; city?: string; country?: string; capacity?: number | null; surface?: string | null } | null;
  referee?: { name?: string; country?: string } | null;
  weather?: { temperature?: number | null; description?: string | null; iconCode?: number | null; windSpeed?: number | null; humidity?: number | null } | null;
}
export interface FotmobData {
  shotmap: FotmobShot[];
  momentum: { data: FotmobMomentumPoint[]; goals: FotmobGoalMarker[] } | null;
  playerStats: FotmobPlayerRating[];
  teamStats: SofascoreMatchStat[]; // full team-stats panel (same shape as sofascoreStats)
  matchInfo: FotmobMatchInfo | null;
  unavailable: { home: FotmobUnavailablePlayer[]; away: FotmobUnavailablePlayer[] } | null;
  homeXg: number | null;
  awayXg: number | null;
}

// Pre-match ("לקראת המשחק") preview — mirrors src/lib/match-preview.ts (JSON-safe).
export interface MatchPreviewFormItem {
  gameId: string;
  result: 'W' | 'D' | 'L';
  scoreHe: string;        // "2 - 1" from this team's perspective
  opponentHe: string;
  dateISO: string;
}
export interface MatchPreviewSidelinedItem {
  nameHe: string;
  typeHe: string;
  kind: 'injury' | 'suspension';
}
export interface MatchPreviewApi {
  form: { home: MatchPreviewFormItem[]; away: MatchPreviewFormItem[] };
  sidelined: { home: MatchPreviewSidelinedItem[]; away: MatchPreviewSidelinedItem[] };
  aiSummary: string | null;
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
  fotmob: FotmobData | null;
  sofascoreShotmap: FotmobShot[]; // Sofascore shot map — used when FotMob has none (league games)
  h2h: H2H | null;
  predicted: { home: PredictedLineupPlayerSummary[]; away: PredictedLineupPlayerSummary[] } | null;
  /** Pre-match preview (form + injuries/suspensions + AI). Null unless SCHEDULED. */
  preview: MatchPreviewApi | null;
  /** Editor-curated content — recap video, report, "match fact". Null when none. */
  editorial: MatchEditorial | null;
  /** Editor-curated photo gallery for this game. */
  gallery: MatchGalleryPhoto[];
}

export interface MatchEditorial {
  recapVideoEmbedUrl: string | null;
  fullMatchEmbedUrl: string | null;
  reportTitleHe: string | null;
  reportHe: string | null;
  matchFactHe: string | null;
}

export interface MatchGalleryPhoto {
  id: string;
  url: string;
  title: string | null;
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
  songs: SongSummary[];
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
  onThisDay: boolean;
}

export type HomeLeagueScopeApi = 'FAVORITES' | 'LIGAT_HAAL' | 'ALL';

export interface PreferencesPayload {
  favoriteTeamApiIds: number[];
  favoriteCompetitionApiIds: number[];
  /** Home next/last-game/predictions league filter. Default 'FAVORITES'. */
  homeLeagueScope: HomeLeagueScopeApi;
  notifications: NotificationPreferences;
  availableTeams: PreferenceTeamOption[];
  availableCompetitions: PreferenceCompetitionOption[];
}

// ---------- History: seasons spine ----------

export interface SeasonSpineApiRow {
  seasonId: string;
  year: number;
  name: string;
  champion: { teamId: string; nameHe: string; logoUrl: string | null } | null;
  runnerUp: { teamId: string; nameHe: string; logoUrl: string | null } | null;
  topScorer: { playerId: string | null; nameHe: string; goals: number } | null;
  relegated: Array<{ teamId: string; nameHe: string; logoUrl: string | null }>;
  /** State Cup winner that season (null: no final data / undecidable draw). */
  cupWinner: { teamId: string; nameHe: string; logoUrl: string | null } | null;
}

export interface SeasonsSpinePayload {
  rows: SeasonSpineApiRow[];
}

// ---------- History: all-time club table ----------

export interface AllTimeApiRow {
  clubKey: string; nameHe: string; logoUrl: string | null; latestTeamId: string;
  seasons: number; played: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; goalsDiff: number; points: number;
}

export interface AllTimeTablePayload {
  scope: 'all' | 'home' | 'away';
  rows: AllTimeApiRow[];
}

// ---------- History: club honors + cup finals ----------
// Mirrors src/lib/history/club-honors.ts's ClubHonors / CupFinalRow.

export interface ClubHonorsApi {
  clubKey: string;
  nameHe: string;
  logoUrl: string | null;
  latestTeamId: string;
  leagueTitles: { count: number; years: number[] };
  stateCup: { count: number; years: number[] };
  totoCup: { count: number; years: number[] };
  superCup: { count: number; years: number[] };
}

export interface CupFinalApi {
  seasonYear: number;
  competitionId: string;
  competitionNameHe: string;
  gameId: string;
  winner: { clubKey: string; nameHe: string } | null; // null = undecidable draw
  loser: { clubKey: string; nameHe: string } | null;
  /** Participants — always populated, so undecided draws can still name both finalists. */
  home: { clubKey: string; nameHe: string };
  away: { clubKey: string; nameHe: string };
  scoreLabel: string; // winner-first when decided
}

export interface CupHonorsPayload {
  honors: ClubHonorsApi[];
  finals: CupFinalApi[];
}

// ---------- History: rivalry (H2H) ----------
// Mirrors src/lib/h2h.ts's FullH2H (web) — same shape, JSON-safe (no Date objects).

export interface H2HCompetitionSplitApi {
  competitionNameHe: string;
  games: number; winsA: number; draws: number; winsB: number;
}
export interface H2HVenueSplitApi { games: number; winsA: number; draws: number; winsB: number }
export interface H2HMeetingApi {
  gameId: string;
  date: string;
  competitionNameHe: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  isAHome: boolean;
  resultFromA: 'W' | 'D' | 'L';
}
export interface FullH2HApiPayload {
  teamAName: string;
  teamBName: string;
  totals: { games: number; winsA: number; draws: number; winsB: number; goalsA: number; goalsB: number };
  byCompetition: H2HCompetitionSplitApi[];
  atAHome: H2HVenueSplitApi;
  atBHome: H2HVenueSplitApi;
  biggestAWin: { gameId: string; label: string; year: number } | null;
  biggestBWin: { gameId: string; label: string; year: number } | null;
  meetings: H2HMeetingApi[];
}

export interface H2HClubOption { clubKey: string; nameHe: string }
export interface H2HClubsPayload { clubs: H2HClubOption[] }

// ---------- History: record book ----------
// Mirrors src/lib/history/records-engine.ts's RecordEntry rows (league scope
// only — club-scope records ship with the team history tab).

export interface RecordCategoryApi {
  key: string;
  titleHe: string;
  eventBased: boolean;
  ordered: boolean;
}

export interface RecordEntryApi {
  id: string;
  rank: number;
  labelHe: string;
  detailHe: string | null;
  playerId: string | null;
  gameId: string | null;
  computedAt: string; // ISO
}

export interface RecordsPayload {
  /** Active league-mode category key; null in club mode. */
  category: string | null;
  categories: RecordCategoryApi[];
  /** Current Ligat Ha'al clubs for the club filter. */
  clubs: Array<{ clubKey: string; nameHe: string; logoUrl: string | null }>;
  /** Active club in club mode; null in league mode. */
  club: { clubKey: string; nameHe: string; logoUrl: string | null } | null;
  /** League-mode rows (single category). Empty in club mode. */
  rows: RecordEntryApi[];
  /** Club-mode groups (the club's whole record book). Empty in league mode. */
  clubGroups: ClubRecordGroupApi[];
}

/** Club-scope record group for the team history tab — mirrors the web page's grouping of RecordEntry rows by RECORD_CATEGORIES. */
export interface ClubRecordGroupApi {
  category: string;
  titleHe: string;
  rows: RecordEntryApi[];
}

// ---------- History: stat-answer cards ("ask a question") ----------
// Mirrors src/lib/stats-qa's AnsweredCard / StatAnswer / StatQuestion shapes.

export interface StatAnswerApi {
  id: string;
  titleHe: string;
  cardType: 'hero' | 'leaderboard';
  headline: { label: string; value: string; unit?: string } | null;
  secondary?: string;
  top?: { name: string; value: string; href?: string }[];
  href?: string;
  coverageNote?: string;
  narrative: string | null;
}

export interface StatQuestionApi {
  id: string;
  scope: 'club' | 'league';
  cardType: 'hero' | 'leaderboard';
  needsClub: boolean;
  needsRival: boolean;
  titleHe: string;
}

export interface StatQuestionsPayload {
  questions: StatQuestionApi[];
  clubs: { clubKey: string; nameHe: string }[];
}

export interface StatAnswerPayload {
  card: StatAnswerApi | null;
}

// ---------- Search ----------

export interface SearchResultApiItem {
  id: string;
  type: 'team' | 'player' | 'game' | 'venue';
  label: string;
  subtitle?: string;
  href: string;
}

export interface SearchPayload {
  results: SearchResultApiItem[];
}
