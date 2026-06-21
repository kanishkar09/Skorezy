import {
  Match,
  ScoreProvider,
  TrackMapData,
  TrackMapFrame,
  F1RaceItem,
  F1RaceResult,
  F1ResultRow,
  F1Standings,
  StandingRow,
  RaceControlMessage,
} from '../core/types';
import { fmtDateTime } from '../util/time';

interface RaceSession {
  name: string; // "Practice 1", "Qualifying", "Race", ...
  shortLabel: string; // "FP1", "Quali", "Race", ...
  start: number; // ms epoch
  end: number; // ms epoch (from OpenF1, or a sensible fallback)
}

interface ScheduleRace {
  name: string;
  round: string;
  circuit: string;
  locality: string;
  country: string;
  start: number; // race start (ms epoch)
  end: number; // race end (ms epoch)
  sessions: RaceSession[]; // FP1/2/3, (Sprint), Quali, Race - chronological
}

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

  // Cache the map data to avoid OpenF1 rate limits (429s) on rapid re-renders.
  private mapCache?: { at: number; data: TrackMapData };
  private static readonly MAP_CACHE_MS = 25000;
  private standingsCache?: { at: number; data: F1Standings };
  private rcCache?: { at: number; data: RaceControlMessage[] };
  private scheduleCache?: { at: number; races: ScheduleRace[] };

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
      const races = await this.loadSchedule();
      if (!races.length) {
        return this.idle();
      }
      const now = Date.now();

      // Is ANY session (practice / qualifying / race) live right now?
      for (const r of races) {
        const liveSession = r.sessions.find((s) => now >= s.start && now <= s.end);
        if (liveSession) {
          return this.raceMatch(r, 'live', liveSession);
        }
      }
      // Otherwise show the next Grand Prix with its weekend timetable.
      const nextRace = races.filter((r) => r.start > now).sort((a, b) => a.start - b.start)[0];
      if (nextRace) {
        return this.raceMatch(nextRace, 'upcoming');
      }
      return this.raceMatch(races[races.length - 1], 'idle');
    } catch (err: any) {
      // Let fetch() decide the fallback (mock when offline).
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Merge Jolpica (nice names + full weekend timetable: FP1/2/3, Quali, Sprint,
   * Race) with OpenF1 (accurate per-session end times) so we can tell which
   * session is upcoming / live / finished precisely. Cached 10m.
   */
  private async loadSchedule(): Promise<ScheduleRace[]> {
    if (this.scheduleCache && Date.now() - this.scheduleCache.at < 600000) {
      return this.scheduleCache.races;
    }
    const year = new Date().getFullYear();
    const [jolpica, sessions] = await Promise.all([
      this.json('https://api.jolpi.ca/ergast/f1/current.json'),
      this.safeJson(`https://api.openf1.org/v1/sessions?year=${year}`), // ALL session types
    ]);
    // "YYYY-MM-DD|Session Name" -> actual end time from OpenF1
    const endByKey = new Map<string, number>();
    for (const s of sessions) {
      if (s.date_start && s.date_end && s.session_name) {
        endByKey.set(
          `${String(s.date_start).slice(0, 10)}|${s.session_name}`,
          new Date(s.date_end).getTime()
        );
      }
    }

    const buildSession = (obj: any, name: string, shortLabel: string): RaceSession | null => {
      if (!obj || !obj.date) {
        return null;
      }
      const start = new Date(`${obj.date}T${obj.time ?? '00:00:00Z'}`).getTime();
      const isRace = name === 'Race';
      const fallback = isRace ? 2.5 * 60 * 60 * 1000 : 75 * 60 * 1000;
      const end = endByKey.get(`${obj.date}|${name}`) ?? start + fallback;
      return { name, shortLabel, start, end };
    };

    const raw: any[] = jolpica?.MRData?.RaceTable?.Races ?? [];
    const races: ScheduleRace[] = raw.map((r) => {
      const sessions: RaceSession[] = [
        buildSession(r.FirstPractice, 'Practice 1', 'FP1'),
        buildSession(r.SecondPractice, 'Practice 2', 'FP2'),
        buildSession(r.ThirdPractice, 'Practice 3', 'FP3'),
        buildSession(r.SprintQualifying ?? r.SprintShootout, 'Sprint Qualifying', 'SQ'),
        buildSession(r.Sprint, 'Sprint', 'Sprint'),
        buildSession(r.Qualifying, 'Qualifying', 'Quali'),
        buildSession({ date: r.date, time: r.time }, 'Race', 'Race'),
      ].filter((s): s is RaceSession => s !== null);
      sessions.sort((a, b) => a.start - b.start);
      const raceSession = sessions.find((s) => s.name === 'Race')!;
      return {
        name: r.raceName,
        round: r.round,
        circuit: r.Circuit?.circuitName ?? '',
        locality: r.Circuit?.Location?.locality ?? '-',
        country: r.Circuit?.Location?.country ?? '-',
        start: raceSession.start,
        end: raceSession.end,
        sessions,
      };
    });
    this.scheduleCache = { at: Date.now(), races };
    return races;
  }

  private raceMatch(
    race: ScheduleRace,
    state: 'upcoming' | 'live' | 'idle',
    liveSession?: RaceSession
  ): Match {
    const raceStart = new Date(race.start);
    const name = race.name;
    const isLive = state === 'live';
    const now = Date.now();
    const SEP = ' · '; // middle dot

    const statusValue =
      state === 'live'
        ? `${liveSession?.name ?? 'Session'} in progress`
        : state === 'upcoming'
          ? this.countdown(raceStart)
          : 'Finished';
    const statusBarText =
      state === 'live'
        ? `${this.short(name)}${SEP}${liveSession?.shortLabel ?? ''} LIVE`
        : state === 'upcoming'
          ? `${this.short(name)}${SEP}${this.countdown(raceStart)}`
          : `${this.short(name)}${SEP}done`;

    // Weekend timetable (each session with local time; the live one tagged).
    const others = race.sessions.map((s) => {
      const tag = now >= s.start && now <= s.end ? ' · 🔴 LIVE' : '';
      return { left: s.name, right: fmtDateTime(new Date(s.start)) + tag };
    });

    return {
      sport: 'f1',
      state,
      emoji: this.emoji,
      statusBarText,
      tooltip: isLive
        ? `${name} - ${liveSession?.name ?? ''} live now`
        : `${name} - ${fmtDateTime(raceStart)}`,
      detail: {
        sport: 'f1',
        state,
        title: name,
        subtitle: `Round ${race.round}${SEP}${race.circuit}`,
        teams: [
          {
            name: isLive ? 'Live now' : 'Race start',
            score: isLive
              ? `${liveSession?.name ?? 'Session'} - open Track Map`
              : fmtDateTime(raceStart),
          },
        ],
        meta: [
          { label: 'Circuit', value: race.locality },
          { label: 'Country', value: race.country },
          // Static row only for live/finished; upcoming uses the live ticking countdown.
          ...(state === 'upcoming'
            ? []
            : [{ label: isLive ? 'Status' : 'Last race', value: statusValue, highlight: true }]),
        ],
        countdownTo: state === 'upcoming' ? race.start : undefined,
        others,
        othersTitle: 'Race weekend',
      },
    };
  }

  /**
   * Build a track map (car positions over time) from OpenF1.
   * Keyless. Uses the most recent race session; if that race is live it shows
   * the latest 60s, otherwise it replays a 60s window from mid-race.
   */
  async getTrackMap(): Promise<TrackMapData> {
    // Serve cached map within the TTL to respect OpenF1 rate limits.
    if (this.mapCache && Date.now() - this.mapCache.at < F1Provider.MAP_CACHE_MS) {
      return this.mapCache.data;
    }
    // Find the most recent race that actually has location telemetry
    // (the very latest race may not be ingested by OpenF1 yet).
    const { session, loc, from, to, isLive } = await this.resolveSession();
    const key = session.session_key;

    const drivers: any[] = await this.json(
      `https://api.openf1.org/v1/drivers?session_key=${key}`
    );
    const cars = drivers.map((d) => ({
      num: d.driver_number as number,
      acronym: (d.name_acronym as string) ?? String(d.driver_number),
      color: '#' + ((d.team_colour as string) || '888888'),
    }));

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

    const leaderboard = await this.buildLeaderboard(key, from, to, cars);

    const data: TrackMapData = {
      sessionName: `${session.country_name ?? ''} GP ${session.year ?? ''}`.trim(),
      circuit: session.circuit_short_name ?? '',
      live: isLive,
      cars,
      frames,
      outline,
      bounds,
      leaderboard,
    };
    this.mapCache = { at: Date.now(), data };
    return data;
  }

  /**
   * Live running order + gaps + tyre compound. Each sub-call is wrapped so a
   * single failure (or rate limit) just omits that column instead of breaking
   * the whole map.
   */
  private async buildLeaderboard(
    key: number,
    from: Date,
    to: Date,
    cars: { num: number; acronym: string; color: string }[]
  ): Promise<TrackMapData['leaderboard']> {
    // Positions change infrequently, so look back ~30 min to capture every
    // driver's latest standing. Gaps update constantly, so a short window is fine.
    const posFrom = new Date(to.getTime() - 30 * 60000);
    const intFrom = new Date(to.getTime() - 120000);
    const [positions, intervals, stints] = await Promise.all([
      this.safeJson(
        `https://api.openf1.org/v1/position?session_key=${key}&date>=${this.iso(posFrom)}&date<=${this.iso(to)}`
      ),
      this.safeJson(
        `https://api.openf1.org/v1/intervals?session_key=${key}&date>=${this.iso(intFrom)}&date<=${this.iso(to)}`
      ),
      this.safeJson(`https://api.openf1.org/v1/stints?session_key=${key}`),
    ]);

    // Latest position per driver in the window.
    const posByDriver = this.latestByDriver(positions);
    // Latest interval/gap per driver.
    const intByDriver = this.latestByDriver(intervals);
    // Latest stint (current tyre) per driver.
    const stintByDriver = new Map<number, any>();
    for (const s of stints) {
      const cur = stintByDriver.get(s.driver_number);
      if (!cur || (s.stint_number ?? 0) > (cur.stint_number ?? 0)) {
        stintByDriver.set(s.driver_number, s);
      }
    }

    const carByNum = new Map(cars.map((c) => [c.num, c]));
    const rows = [...posByDriver.entries()]
      .map(([num, p]) => {
        const car = carByNum.get(num);
        const pos = p.position as number;
        const intv = intByDriver.get(num);
        const stint = stintByDriver.get(num);
        return {
          pos,
          num,
          acronym: car?.acronym ?? String(num),
          color: car?.color ?? '#888888',
          gap: pos === 1 ? 'Leader' : this.fmtGap(intv?.gap_to_leader),
          tyre: stint?.compound as string | undefined,
          tyreAge: stint?.tyre_age_at_start as number | undefined,
        };
      })
      .filter((r) => typeof r.pos === 'number')
      .sort((a, b) => a.pos - b.pos);

    return rows;
  }

  private latestByDriver(rows: any[]): Map<number, any> {
    const map = new Map<number, any>();
    for (const r of rows) {
      const t = new Date(r.date).getTime();
      const cur = map.get(r.driver_number);
      if (!cur || t > cur.__t) {
        map.set(r.driver_number, { ...r, __t: t });
      }
    }
    return map;
  }

  private fmtGap(v: any): string {
    if (v == null) {
      return '—';
    }
    if (typeof v === 'string') {
      return v; // e.g. "+1 LAP"
    }
    return '+' + Number(v).toFixed(3);
  }

  private async safeJson(url: string): Promise<any[]> {
    try {
      const r = await this.json(url);
      return Array.isArray(r) ? r : [];
    } catch {
      return [];
    }
  }

  /**
   * Race control feed (flags, safety car, DRS, penalties) for the most recent
   * race that has messages. Keyless (OpenF1), cached 25s, newest-first.
   */
  async getRaceControl(): Promise<RaceControlMessage[]> {
    if (this.rcCache && Date.now() - this.rcCache.at < F1Provider.MAP_CACHE_MS) {
      return this.rcCache.data;
    }
    const candidates = await this.candidateSessions();
    for (const s of candidates) {
      const rows = await this.safeJson(
        `https://api.openf1.org/v1/race_control?session_key=${s.session_key}`
      );
      if (rows.length) {
        const data: RaceControlMessage[] = rows
          .filter((r: any) => r.message)
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 60)
          .map((r: any) => ({
            lap: r.lap_number ?? null,
            category: r.category ?? 'Other',
            flag: r.flag ?? '',
            scope: r.scope ?? '',
            driver: r.driver_number ?? null,
            message: r.message,
          }));
        this.rcCache = { at: Date.now(), data };
        return data;
      }
    }
    return [];
  }

  /** Driver + constructor championship standings (cached 10 min). */
  async getStandings(): Promise<F1Standings> {
    if (this.standingsCache && Date.now() - this.standingsCache.at < 600000) {
      return this.standingsCache.data;
    }
    const year = new Date().getFullYear();
    const tryYear = async (y: number) => {
      const [d, c] = await Promise.all([
        this.json(`https://api.jolpi.ca/ergast/f1/${y}/driverStandings.json`),
        this.json(`https://api.jolpi.ca/ergast/f1/${y}/constructorStandings.json`),
      ]);
      return {
        season: String(y),
        dl: d?.MRData?.StandingsTable?.StandingsLists?.[0],
        cl: c?.MRData?.StandingsTable?.StandingsLists?.[0],
      };
    };

    let r = await tryYear(year);
    if (!r.dl) {
      r = await tryYear(year - 1);
    }

    const drivers: StandingRow[] = (r.dl?.DriverStandings ?? []).map((s: any) => ({
      pos: s.position,
      name: `${s.Driver?.givenName ?? ''} ${s.Driver?.familyName ?? ''}`.trim(),
      team: s.Constructors?.[s.Constructors.length - 1]?.name ?? '',
      points: s.points,
      wins: s.wins,
    }));
    const constructors: StandingRow[] = (r.cl?.ConstructorStandings ?? []).map((s: any) => ({
      pos: s.position,
      name: s.Constructor?.name ?? '',
      points: s.points,
      wins: s.wins,
    }));

    const data: F1Standings = { season: r.season, drivers, constructors };
    this.standingsCache = { at: Date.now(), data };
    return data;
  }

  /** Past races (this season, plus last season if early) for the race browser. */
  async getRaces(): Promise<F1RaceItem[]> {
    const year = new Date().getFullYear();
    const now = Date.now();
    const fetchYear = async (y: number): Promise<F1RaceItem[]> => {
      const json = await this.json(`https://api.jolpi.ca/ergast/f1/${y}.json`);
      const races: any[] = json?.MRData?.RaceTable?.Races ?? [];
      return races
        .filter((r) => new Date(`${r.date}T${r.time ?? '00:00:00Z'}`).getTime() <= now)
        .map((r) => ({
          season: r.season,
          round: r.round,
          name: r.raceName,
          dateLabel: new Date(r.date).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
        }))
        .reverse(); // most recent first
    };

    let list = await fetchYear(year);
    if (list.length < 3) {
      const prev = await fetchYear(year - 1);
      list = [...list, ...prev];
    }
    return list;
  }

  /** Full classified result of a chosen race. */
  async getRaceResult(season: string, round: string): Promise<F1RaceResult> {
    const json = await this.json(
      `https://api.jolpi.ca/ergast/f1/${season}/${round}/results.json`
    );
    const race = json?.MRData?.RaceTable?.Races?.[0];
    if (!race) {
      throw new Error('No result available for that race');
    }
    const rows: F1ResultRow[] = (race.Results ?? []).map((r: any) => ({
      pos: r.positionText ?? r.position,
      driver: `${r.Driver?.givenName ?? ''} ${r.Driver?.familyName ?? ''}`.trim(),
      team: r.Constructor?.name ?? '',
      result: r.Time?.time ?? r.status ?? '',
    }));
    return {
      name: `${race.raceName} ${race.season}`,
      dateLabel: new Date(race.date).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      rows,
    };
  }

  /**
   * Most-recent-first list of sessions (ALL types: practice, qualifying, race)
   * that have already started — so the map/feed follow whatever session is live
   * or most recent, not just the race.
   */
  private async candidateSessions(): Promise<any[]> {
    const year = new Date().getFullYear();
    const now = Date.now();
    const started = (list: any[]) =>
      list
        .filter((s) => new Date(s.date_start).getTime() <= now)
        .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());

    let past = started(await this.json(`https://api.openf1.org/v1/sessions?year=${year}`));
    if (!past.length) {
      past = started(await this.json(`https://api.openf1.org/v1/sessions?year=${year - 1}`));
    }
    if (!past.length) {
      throw new Error('No completed F1 session found');
    }
    return past.slice(0, 8);
  }

  /**
   * Pick the most recent race that actually has location data. The very latest
   * race is sometimes not yet ingested by OpenF1, so we fall back to older ones.
   */
  private async resolveSession(): Promise<{
    session: any;
    loc: any[];
    from: Date;
    to: Date;
    isLive: boolean;
  }> {
    const candidates = await this.candidateSessions();
    for (const session of candidates) {
      const start = new Date(session.date_start).getTime();
      const end = session.date_end ? new Date(session.date_end).getTime() : start + 7200000;
      const now = Date.now();
      const isLive = now >= start && now <= end;
      const from = isLive ? new Date(now - 60000) : new Date(start + 15 * 60000);
      const to = isLive ? new Date(now) : new Date(from.getTime() + 60000);
      const loc = await this.safeJson(
        `https://api.openf1.org/v1/location?session_key=${session.session_key}` +
          `&date>=${this.iso(from)}&date<=${this.iso(to)}`
      );
      if (loc.length) {
        return { session, loc, from, to, isLive };
      }
    }
    throw new Error('No F1 location data available for recent races');
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
