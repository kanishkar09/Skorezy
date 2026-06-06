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

/** Contract every sport implements. Add a sport = add one of these. */
export interface ScoreProvider {
  readonly id: SportId;
  readonly emoji: string;
  /** Fetch latest data and map it to the common Match model. */
  fetch(): Promise<Match>;
}
