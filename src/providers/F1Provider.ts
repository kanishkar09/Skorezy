import { Match, ScoreProvider, TrackMapData, TrackMapFrame } from '../core/types';

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

  constructor(private readonly useMockData: boolean = false) {}

  async fetch(): Promise<Match> {
    // F1 is keyless — always fetch live. Mock is only a last-resort fallback
    // if the live call fails (e.g. no internet).
    try {
      return await this.live();
    } catch {
      return this.mock();
    }
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
      // Let fetch() decide the fallback (mock when offline).
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Build a track map (car positions over time) from OpenF1.
   * Keyless. Uses the most recent race session; if that race is live it shows
   * the latest 60s, otherwise it replays a 60s window from mid-race.
   */
  async getTrackMap(): Promise<TrackMapData> {
    const session = await this.latestRaceSession();
    const key = session.session_key;

    const drivers: any[] = await this.json(
      `https://api.openf1.org/v1/drivers?session_key=${key}`
    );
    const cars = drivers.map((d) => ({
      num: d.driver_number as number,
      acronym: (d.name_acronym as string) ?? String(d.driver_number),
      color: '#' + ((d.team_colour as string) || '888888'),
    }));

    // Decide the time window.
    const sessionStart = new Date(session.date_start).getTime();
    const sessionEnd = session.date_end ? new Date(session.date_end).getTime() : sessionStart + 7200000;
    const now = Date.now();
    const isLive = now >= sessionStart && now <= sessionEnd;

    let from: Date;
    let to: Date;
    if (isLive) {
      to = new Date(now);
      from = new Date(now - 60000);
    } else {
      from = new Date(sessionStart + 15 * 60000); // 15 min into the race
      to = new Date(from.getTime() + 60000);
    }

    const loc: any[] = await this.json(
      `https://api.openf1.org/v1/location?session_key=${key}` +
        `&date>=${this.iso(from)}&date<=${this.iso(to)}`
    );

    // Bucket into 1-second frames; last sample in each second wins.
    const bySec = new Map<number, Map<number, { x: number; y: number }>>();
    const all: { x: number; y: number }[] = [];
    for (const p of loc) {
      if (p.x === 0 && p.y === 0) {
        continue; // skip pit/garage zeros
      }
      const t = Math.floor(new Date(p.date).getTime() / 1000);
      if (!bySec.has(t)) {
        bySec.set(t, new Map());
      }
      bySec.get(t)!.set(p.driver_number, { x: p.x, y: p.y });
      all.push({ x: p.x, y: p.y });
    }

    const frames: TrackMapFrame[] = [...bySec.keys()]
      .sort((a, b) => a - b)
      .map((s) => ({
        cars: [...bySec.get(s)!.entries()].map(([num, pos]) => ({ num, x: pos.x, y: pos.y })),
      }));

    // Trace the circuit by sampling all recorded points.
    const step = Math.max(1, Math.floor(all.length / 1500));
    const outline = all.filter((_, i) => i % step === 0);

    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };

    return {
      sessionName: `${session.country_name ?? ''} GP ${session.year ?? ''}`.trim(),
      circuit: session.circuit_short_name ?? '',
      live: isLive,
      cars,
      frames,
      outline,
      bounds,
    };
  }

  private async latestRaceSession(): Promise<any> {
    const year = new Date().getFullYear();
    const now = Date.now();
    // A race only has telemetry once it has started — ignore future fixtures.
    const started = (list: any[]) =>
      list
        .filter((s) => new Date(s.date_start).getTime() <= now)
        .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());

    let past = started(
      await this.json(`https://api.openf1.org/v1/sessions?year=${year}&session_type=Race`)
    );
    if (!past.length) {
      past = started(
        await this.json(`https://api.openf1.org/v1/sessions?year=${year - 1}&session_type=Race`)
      );
    }
    if (!past.length) {
      throw new Error('No completed F1 race found');
    }
    return past[0];
  }

  private async json(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OpenF1 HTTP ${res.status}`);
    }
    return res.json();
  }

  private iso(d: Date): string {
    return d.toISOString().replace('Z', '+00:00');
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
