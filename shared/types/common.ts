// shared/types/common.ts

export type UserRole = 'USER' | 'ADMIN';

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

// ---------- Domain primitives ----------

export interface TeamSummary {
  id: string;
  apiId: number | null;
  nameEn: string;
  nameHe: string;
  logoUrl: string | null;
}

export interface TeamHeader extends TeamSummary {
  founded: number | null;
  venueName: string | null;
  city: string | null;
  aiSummaryText: string | null;
  wikiSummary: string | null;
  wikiThumbnail: string | null;
  wikiSourceUrl: string | null;
}

export interface PlayerSummary {
  id: string;
  apiId: number | null;
  nameEn: string;
  nameHe: string;
  photoUrl: string | null;
  position: string | null;
  jerseyNumber: number | null;
}

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface MatchCard {
  id: string;
  apiId: number | null;
  date: string;
  status: MatchStatus;
  minute: number | null;
  home: { team: TeamSummary; score: number | null };
  away: { team: TeamSummary; score: number | null };
  leagueId: string;
  leagueName: string;
  /** Set when the match wasn't actually played but a result was awarded (e.g. abandoned game). */
  awarded?: boolean;
}

export interface NewsCard {
  id: string;
  source: string;
  team: string | null;
  imageUrl: string | null;
  preview: string;
  publishedAt: string;
  url: string | null;
}

export interface StandingRow {
  rank: number;
  team: TeamSummary;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}
