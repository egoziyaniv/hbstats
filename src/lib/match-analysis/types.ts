// src/lib/match-analysis/types.ts — the shapes the fact engine works on. Detectors are pure
// functions over these, so every number in an analysis can be unit-tested without a database.

export type AnalysisKind = 'POST' | 'PRE';

export interface ClubGoal {
  minute: number;
  forClub: boolean;
  ownGoal: boolean;
  scorerKey: string | null; // canonical player id
  scorerHe: string | null;
  bySub: boolean | null; // null when the game has no lineups
}

export interface ClubGame {
  id: string;
  date: Date;
  seasonYear: number;
  competitionId: string | null;
  isLeague: boolean;
  atHome: boolean;
  opponentKey: string;
  opponentHe: string;
  venueKey: string | null;
  venueHe: string | null;
  gf: number | null; // null when not played yet
  ga: number | null;
  goals: ClubGoal[] | null; // null = goal minutes incomplete
  hasLineups: boolean;
}

export interface LeagueGame {
  id: string;
  date: Date;
  seasonYear: number;
  homeKey: string;
  awayKey: string;
  homeHe: string;
  awayHe: string;
  hs: number;
  as: number;
}

export interface Fact {
  key: string;
  kind: AnalysisKind;
  scope: 'club' | 'league';
  coverageHe: string;
  rarity: number; // 0..1, higher = rarer
  textHe: string; // deterministic statement carrying the numbers
  numbers: Record<string, number | string>;
  evidenceGameIds: string[];
  removed?: boolean; // the editor dropped it
}

export interface DetectorInput {
  kind: AnalysisKind;
  target: ClubGame;
  history: ClubGame[]; // completed official games before target, oldest first
  league: LeagueGame[]; // top-flight games of the complete era, oldest first
  leagueFrom: number | null;
  clubHe: string;
}

export type Detector = (input: DetectorInput) => Fact[];
