import { Match, ScoreProvider } from '../core/types';

/**
 * Formula 1.
 *
 * Mock mode: realistic sample data.
 * Live mode: Jolpica (Ergast successor) — fully free, NO API KEY needed.
 *            Docs: https://github.com/jolpica/jolpica-f1
 *            (OpenF1 can be added later for live timing.)
 */
export class F1Provider implements ScoreProvider {
  readonly id = 'f1' as const;
  readonly emoji = '🏎️';

  constructor(private readonly useMockData: boolean) {}

  async fetch(): Promise<Match> {
    if (this.useMockData) {
      return this.mock();
    }
    return this.live();
  }

  private mock(): Match {
    return {
      sport: 'f1',
      state: 'upcoming',
      emoji: this.emoji,
      statusBarText: 'Monaco GP · 2d 4h',
      tooltip: 'Next: Monaco Grand Prix in 2 days 4 hours',
      detail: {
        sport: 'f1',
        state: 'upcoming',
        title: 'Monaco Grand Prix',
        subtitle: 'Round 8 · Circuit de Monaco',
        teams: [
          { name: 'Race start', score: 'Sun 14:00' },
        ],
        meta: [
          { label: 'Practice 1', value: 'Fri 13:30' },
          { label: 'Qualifying', value: 'Sat 16:00' },
          { label: 'Lights out', value: 'Sun 14:00', highlight: true },
        ],
        others: [
          { left: 'Last race (Imola)', right: '1. Verstappen' },
          { left: 'Championship', right: 'VER 161 pts' },
        ],
      },
    };
  }

  private async live(): Promise<Match> {
    try {
      const res = await fetch('https://api.jolpi.ca/ergast/f1/current/next.json');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: any = await res.json();
      const race = json?.MRData?.RaceTable?.Races?.[0];
      if (!race) {
        return this.idle();
      }
      const start = new Date(`${race.date}T${race.time ?? '00:00:00Z'}`);
      const countdown = this.countdown(start);
      const name = race.raceName as string;
      return {
        sport: 'f1',
        state: 'upcoming',
        emoji: this.emoji,
        statusBarText: `${this.short(name)} · ${countdown}`,
        tooltip: `Next: ${name} — ${start.toLocaleString()}`,
        detail: {
          sport: 'f1',
          state: 'upcoming',
          title: name,
          subtitle: `Round ${race.round} · ${race.Circuit?.circuitName ?? ''}`,
          teams: [{ name: 'Race start', score: start.toLocaleString() }],
          meta: [
            { label: 'Circuit', value: race.Circuit?.Location?.locality ?? '—' },
            { label: 'Country', value: race.Circuit?.Location?.country ?? '—' },
            { label: 'Starts in', value: countdown, highlight: true },
          ],
          others: [],
        },
      };
    } catch (err: any) {
      return this.error(err?.message ?? 'fetch failed');
    }
  }

  private short(name: string): string {
    return name.replace(/ Grand Prix/i, ' GP');
  }

  private countdown(target: Date): string {
    const ms = target.getTime() - Date.now();
    if (ms <= 0) {
      return 'live/soon';
    }
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }

  private idle(): Match {
    return {
      sport: 'f1', state: 'idle', emoji: this.emoji,
      statusBarText: 'No upcoming race', tooltip: 'No upcoming F1 race found',
      detail: { sport: 'f1', state: 'idle', title: 'No upcoming race', teams: [], meta: [] },
    };
  }

  private error(msg: string): Match {
    return {
      sport: 'f1', state: 'error', emoji: this.emoji,
      statusBarText: '⚠ f1', tooltip: `F1 error: ${msg}`,
      detail: { sport: 'f1', state: 'error', title: 'Error', subtitle: msg, teams: [], meta: [] },
    };
  }
}
