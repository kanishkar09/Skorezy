import { Match, ScoreProvider } from '../core/types';

/**
 * Football scores.
 *
 * Mock mode: realistic sample data.
 * Live mode: football-data.org — set sportbar.useMockData=false and provide
 *            a free API key. Docs: https://www.football-data.org/documentation
 */
export class FootballProvider implements ScoreProvider {
  readonly id = 'football' as const;
  readonly emoji = '⚽';

  constructor(private readonly useMockData: boolean, private readonly apiKey?: string) {}

  async fetch(): Promise<Match> {
    if (this.apiKey) {
      return this.live();
    }
    return this.useMockData ? this.mock() : this.idle();
  }

  private mock(): Match {
    return {
      sport: 'football',
      state: 'live',
      emoji: this.emoji,
      statusBarText: 'ARS 2-1 CHE 67\'',
      tooltip: 'Arsenal 2-1 Chelsea · 67\' · Premier League',
      detail: {
        sport: 'football',
        state: 'live',
        title: 'Premier League',
        subtitle: "Emirates Stadium · 67'",
        teams: [
          { name: 'Arsenal', flag: '🔴', score: '2' },
          { name: 'Chelsea', flag: '🔵', score: '1' },
        ],
        meta: [
          { label: 'Scorers', value: 'Saka 12\', Ødegaard 44\'', highlight: true },
          { label: 'CHE', value: 'Palmer 51\'' },
          { label: 'Status', value: "2nd Half · 67'" },
        ],
        others: [
          { left: '🔵 MCI vs LIV 🔴', right: '1 - 1 · 73\'' },
          { left: '⚪ TOT vs MUN 🔴', right: 'KO 20:00' },
        ],
      },
    };
  }

  private async live(): Promise<Match> {
    try {
      const res = await fetch('https://api.football-data.org/v4/matches?status=LIVE', {
        headers: { 'X-Auth-Token': this.apiKey! },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: any = await res.json();
      const m = (json.matches || [])[0];
      if (!m) {
        return this.idle();
      }
      const home = m.homeTeam?.shortName ?? m.homeTeam?.name ?? 'Home';
      const away = m.awayTeam?.shortName ?? m.awayTeam?.name ?? 'Away';
      const hs = m.score?.fullTime?.home ?? 0;
      const as = m.score?.fullTime?.away ?? 0;
      return {
        sport: 'football',
        state: 'live',
        emoji: this.emoji,
        statusBarText: `${home} ${hs}-${as} ${away}`,
        tooltip: `${home} ${hs}-${as} ${away} · ${m.competition?.name ?? ''}`,
        detail: {
          sport: 'football',
          state: 'live',
          title: m.competition?.name ?? 'Football',
          subtitle: m.status,
          teams: [
            { name: home, score: String(hs) },
            { name: away, score: String(as) },
          ],
          meta: [{ label: 'Status', value: m.status }],
          others: [],
        },
      };
    } catch (err: any) {
      return this.error(err?.message ?? 'fetch failed');
    }
  }

  private idle(): Match {
    return {
      sport: 'football', state: 'idle', emoji: this.emoji,
      statusBarText: 'No live match', tooltip: 'No live football right now',
      detail: { sport: 'football', state: 'idle', title: 'No live football', teams: [], meta: [] },
    };
  }

  private error(msg: string): Match {
    return {
      sport: 'football', state: 'error', emoji: this.emoji,
      statusBarText: '⚠ football', tooltip: `Football error: ${msg}`,
      detail: { sport: 'football', state: 'error', title: 'Error', subtitle: msg, teams: [], meta: [] },
    };
  }
}
