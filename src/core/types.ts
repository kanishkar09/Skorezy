// Shared domain models. Every sport speaks this common language so the
// ScoreManager and UI never need sport-specific code.

export type SportId = 'cricket' | 'football' | 'f1';

export type SportState = 'live' | 'upcoming' | 'idle' | 'error';

/** One team / competitor line shown in the detail panel. */
export interface TeamScore {
  name: string;
  flag?: string; // emoji flag or badge
  score?: string; // e.g. "245/3 (38.2 ov)" or "2"
  dim?: boolean; // render greyed out (e.g. the team not currently batting)
}

/** A generic label/value chip (CRR, REQ, scorer, lap, etc.). */
export interface DetailRow {
  label: string;
  value: string;
  highlight?: boolean;
}

/** A single ball in the "this over" strip (cricket). */
export interface Ball {
  text: string;
  kind?: 'dot' | 'run' | 'four' | 'six' | 'w';
}

/** Everything the webview needs to render one sport's detail view. */
export interface DetailView {
  sport: SportId;
  state: SportState;
  title: string; // series / league / Grand Prix name
  subtitle?: string; // venue / round / status text
  teams: TeamScore[];
  meta: DetailRow[];
  balls?: Ball[];
  others?: { left: string; right: string }[]; // other live matches
}

/** The unit every provider returns. */
export interface Match {
  sport: SportId;
  state: SportState;
  emoji: string;
  statusBarText: string; // compact, e.g. "IND 245/3 (38.2)"
  tooltip: string;
  detail: DetailView;
}

// ---- Cricket full scorecard (CricketData.org) ----

export interface BatterLine {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  sr: number;
  out: string; // "batting" or dismissal text
  notOut: boolean;
}

export interface BowlerLine {
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  econ: number;
}

export interface InningsCard {
  title: string;
  batting: BatterLine[];
  bowling: BowlerLine[];
}

export interface CricketScorecard {
  name: string;
  series: string;
  venue: string;
  status: string;
  toss: string;
  teams: { name: string; short: string; score?: string }[];
  innings: InningsCard[];
}

// ---- F1 live track map (OpenF1) ----

export interface TrackMapCar {
  num: number;
  acronym: string;
  color: string; // "#RRGGBB"
}

export interface TrackMapFrame {
  cars: { num: number; x: number; y: number }[];
}

export interface LeaderboardRow {
  pos: number;
  num: number;
  acronym: string;
  color: string;
  gap: string; // "Leader" | "+1.234" | "+1 LAP"
  tyre?: string; // SOFT | MEDIUM | HARD | INTERMEDIATE | WET
  tyreAge?: number;
}

export interface TrackMapData {
  sessionName: string;
  circuit: string;
  live: boolean;
  cars: TrackMapCar[];
  frames: TrackMapFrame[];
  outline: { x: number; y: number }[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  leaderboard: LeaderboardRow[];
}

/** Contract every sport implements. Add a sport = add one of these. */
export interface ScoreProvider {
  readonly id: SportId;
  readonly emoji: string;
  /** Fetch latest data and map it to the common Match model. */
  fetch(): Promise<Match>;
}
