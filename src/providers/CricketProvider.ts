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

  constructor(private readonly useMockData: boolean, private readonly apiKey?: string) {}

  async fetch(): Promise<Match> {
    if (this.useMockData || !this.apiKey) {
      return this.mock();
    }
    return this.live();
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

  // Live CricketData.org integration. Returns the first live match found.
  private async live(): Promise<Match> {
    try {
      const url = `https://api.cricapi.com/v1/currentMatches?apikey=${this.apiKey}&offset=0`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: any = await res.json();
      const m = (json.data || []).find((x: any) => x.matchStarted && !x.matchEnded) || (json.data || [])[0];
      if (!m) {
        return this.idle();
      }
      const scoreText = (m.score || [])
        .map((s: any) => `${s.r}/${s.w} (${s.o})`)
        .join('  ');
      const compact = `${m.teams?.[0] ?? ''} ${(m.score?.[0] ? `${m.score[0].r}/${m.score[0].w}` : '')}`.trim();
      return {
        sport: 'cricket',
        state: m.matchStarted && !m.matchEnded ? 'live' : 'idle',
        emoji: this.emoji,
        statusBarText: compact || m.name,
        tooltip: m.status || m.name,
        detail: {
          sport: 'cricket',
          state: m.matchStarted && !m.matchEnded ? 'live' : 'idle',
          title: m.name,
          subtitle: m.venue,
          teams: (m.teams || []).map((t: string, i: number) => ({
            name: t,
            score: m.score?.[i] ? `${m.score[i].r}/${m.score[i].w} (${m.score[i].o})` : undefined,
          })),
          meta: [{ label: 'Status', value: m.status || '—' }],
          others: [],
        },
      };
    } catch (err: any) {
      return this.error(err?.message ?? 'fetch failed');
    }
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
