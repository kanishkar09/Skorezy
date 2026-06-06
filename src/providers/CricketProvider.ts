import { Match, ScoreProvider } from '../core/types';

/**
 * Cricket scores.
 *
 * Mock mode: returns realistic sample data so the extension works instantly.
 * Live mode: CricketData.org (cricapi) — set sportbar.useMockData=false and
 *            provide an API key. Free tier ~100 requests/day.
 *            Docs: https://cricketdata.org
 */
export class CricketProvider implements ScoreProvider {
  readonly id = 'cricket' as const;
  readonly emoji = '🏏';

  constructor(
    private readonly useMockData: boolean,
    private readonly apiKey?: string,
    private readonly favoriteTeams: string[] = []
  ) {}

  async fetch(): Promise<Match> {
    // A configured key always wins: show live data. Otherwise fall back to
    // mock data (dev default) or an idle state.
    if (this.apiKey) {
      return this.live();
    }
    return this.useMockData ? this.mock() : this.idle();
  }

  private mock(): Match {
    return {
      sport: 'cricket',
      state: 'live',
      emoji: this.emoji,
      statusBarText: 'IND 245/3 (38.2)',
      tooltip: 'India 245/3 (38.2 ov) — chasing 289 · Kohli 82*',
      detail: {
        sport: 'cricket',
        state: 'live',
        title: '2nd ODI · India tour of Australia',
        subtitle: 'Sydney Cricket Ground',
        teams: [
          { name: 'India', flag: '🇮🇳', score: '245/3 (38.2 ov)' },
          { name: 'Australia', flag: '🇦🇺', score: '288/7 (50 ov)', dim: true },
        ],
        meta: [
          { label: 'Batting', value: 'Kohli 82* (74)', highlight: true },
          { label: 'CRR', value: '6.39' },
          { label: 'REQ', value: '3.73' },
        ],
        balls: [
          { text: '1', kind: 'run' },
          { text: '4', kind: 'four' },
          { text: '.', kind: 'dot' },
          { text: 'W', kind: 'w' },
          { text: '6', kind: 'six' },
          { text: '2', kind: 'run' },
        ],
        others: [
          { left: '🏴 ENG vs 🇿🇦 RSA', right: '134/2 (22)' },
          { left: '🇵🇰 PAK vs 🇳🇿 NZ', right: 'Starts 14:30' },
        ],
      },
    };
  }

  /**
   * Live cricket via the cricScore endpoint (much broader coverage than
   * currentMatches). Prefers in-progress ("live") matches, favouring the
   * user's favorite teams, then falls back to the next fixture / recent result.
   */
  private async live(): Promise<Match> {
    try {
      const res = await fetch(`https://api.cricapi.com/v1/cricScore?apikey=${this.apiKey}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: any = await res.json();
      const data: any[] = json.data || [];
      if (!data.length) {
        return this.idle();
      }

      const liveMatches = data.filter((m) => m.ms === 'live');
      const chosen =
        this.pickFavorite(liveMatches) ??
        liveMatches[0] ??
        this.pickFavorite(data.filter((m) => m.ms === 'fixture')) ??
        data.find((m) => m.ms === 'fixture') ??
        data[0];

      const isLive = chosen.ms === 'live';
      const isFixture = chosen.ms === 'fixture';
      const c1 = this.code(chosen.t1);
      const c2 = this.code(chosen.t2);

      const parts: string[] = [];
      if (chosen.t1s) {
        parts.push(`${c1} ${chosen.t1s}`);
      }
      if (chosen.t2s) {
        parts.push(`${c2} ${chosen.t2s}`);
      }
      const compact = parts.length ? parts.join(' · ') : `${c1} v ${c2}`;

      // List a few other live matches for context.
      const others = liveMatches
        .filter((m) => m !== chosen)
        .slice(0, 4)
        .map((m) => ({
          left: `${this.code(m.t1)} v ${this.code(m.t2)}`,
          right: (m.t1s || m.t2s || m.status || '').slice(0, 24),
        }));

      return {
        sport: 'cricket',
        state: isLive ? 'live' : isFixture ? 'upcoming' : 'idle',
        emoji: this.emoji,
        statusBarText: compact,
        tooltip: `${this.clean(chosen.t1)} vs ${this.clean(chosen.t2)} — ${chosen.status}`,
        detail: {
          sport: 'cricket',
          state: isLive ? 'live' : isFixture ? 'upcoming' : 'idle',
          title: chosen.series || 'Cricket',
          subtitle: chosen.status,
          teams: [
            { name: this.clean(chosen.t1), score: chosen.t1s || undefined },
            { name: this.clean(chosen.t2), score: chosen.t2s || undefined },
          ],
          meta: [{ label: 'Status', value: chosen.status || '—', highlight: isLive }],
          others,
        },
      };
    } catch (err: any) {
      return this.error(err?.message ?? 'fetch failed');
    }
  }

  /** Pick the first match involving a favorite team, or undefined. */
  private pickFavorite(list: any[]): any | undefined {
    if (!this.favoriteTeams.length) {
      return undefined;
    }
    const favs = this.favoriteTeams.map((f) => f.toLowerCase());
    return list.find(
      (m) => this.isFavorite(m.t1, favs) || this.isFavorite(m.t2, favs)
    );
  }

  /** Exact match on cleaned name or code — so "India" != "Indian Royals". */
  private isFavorite(team: string, favs: string[]): boolean {
    const name = this.clean(team).toLowerCase();
    const code = this.code(team).toLowerCase();
    return favs.some((f) => f === name || f === code);
  }

  /** "India [IND]" -> "IND"; falls back to first 3 letters. */
  private code(team: string): string {
    const m = /\[([^\]]+)\]/.exec(team || '');
    if (m) {
      return m[1];
    }
    return (team || '').replace(/\s*\[.*\]/, '').slice(0, 3).toUpperCase();
  }

  /** "India [IND]" -> "India". */
  private clean(team: string): string {
    return (team || '').replace(/\s*\[[^\]]*\]/, '').trim();
  }

  private idle(): Match {
    return {
      sport: 'cricket', state: 'idle', emoji: this.emoji,
      statusBarText: 'No live match', tooltip: 'No live cricket right now',
      detail: { sport: 'cricket', state: 'idle', title: 'No live cricket', teams: [], meta: [] },
    };
  }

  private error(msg: string): Match {
    return {
      sport: 'cricket', state: 'error', emoji: this.emoji,
      statusBarText: '⚠ cricket', tooltip: `Cricket error: ${msg}`,
      detail: { sport: 'cricket', state: 'error', title: 'Error', subtitle: msg, teams: [], meta: [] },
    };
  }
}
