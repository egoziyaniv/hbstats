export type CardType = 'hero' | 'leaderboard';

export interface StatAnswer {
  headline: { label: string; value: string; unit?: string } | null; // null → empty state
  secondary?: string;
  top?: { name: string; value: string; href?: string }[]; // leaderboard card
  href?: string;
  coverageNote?: string;
}

export interface ResolveCtx {
  clubKey?: string;
  rivalKey?: string;
}

export interface StatQuestion {
  id: string;
  scope: 'club' | 'league';
  titleHe: (ctx: ResolveCtx & { clubNameHe?: string; rivalNameHe?: string }) => string;
  needsClub: boolean;
  needsRival?: boolean;
  cardType: CardType;
  resolve: (ctx: ResolveCtx) => Promise<StatAnswer>;
}
