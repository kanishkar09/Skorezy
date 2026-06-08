import { Match, ScoreProvider } from '../core/types';

/**
 * Football scores — keyless, works for everyone out of the box.
 *
 * Uses ESPN's free public soccer scoreboards (no API key, no signup), the
 * football equivalent of OpenF1. Queries several major competitions and shows
 * a live match (favourites first), else the next fixture, else the latest result.
 */
const DEFAULT_LEAGUES = [
  'eng.1', // Premier League
  'esp.1', // La Liga
  'ita.1', // Serie A
  'ger.1', // Bundesliga
  'fra.1', // Ligue 1
  'uefa.champions', // Champions League
  'fifa.world', // World Cup
  'usa.1', // MLS
];

interface FEvent {
  league: string;
  state: string; // 'pre' | 'in' | 'post'
  desc: string;
  clock: string;
  date: number;
  home: { name: string; abbr: string; score: string };
  away: { name: string; abbr: string; score: string };
}

export class FootballProvider implements ScoreProvider {
  readonly id = 'football' as const;
  readonly emoji = '⚽';

  constructor(
    private readonly leagues: string[] = DEFAULT_LEAGUES,
    private readonly favoriteTeams: string[] = []
  ) {}

  async fetch(): Promise<Match> {
    try {
      const lgs = this.leagues.length ? this.leagues : DEFAULT_LEAGUES;
      const results = await Promise.allSettled(lgs.map((l) => this.league(l)));
      const events: FEvent[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          events.push(...r.value);
        }
      }
      if (!events.length) {
        return this.idle();
      }

      const live = events.filter((e) => e.state === 'in');
      const upcoming = events.filter((e) => e.state === 'pre').sort((a, b) => a.date - b.date);
      const recent = events.filter((e) => e.state === 'post').sort((a, b) => b.date - a.date);

      const chosen =
        this.fav(live) ??
        live[0] ??
        this.fav(upcoming) ??
        upcoming[0] ??
        this.fav(recent) ??
        recent[0];

      if (!chosen) {
        return this.idle();
      }
      return this.toMatch(chosen, live);
    } catch (err: any) {
      return this.error(err?.message ?? 'fetch failed');
    }
  }

  private async league(code: string): Promise<FEvent[]> {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard`
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json: any = await res.json();
    const leagueName = json.leagues?.[0]?.abbreviation ?? code;
    return (json.events || []).map((e: any) => this.parse(e, leagueName));
  }

  private parse(e: any, league: string): FEvent {
    const comp = e.competitions?.[0] ?? {};
    const cs: any[] = comp.competitors ?? [];
    const home = cs.find((c) => c.homeAway === 'home') ?? cs[0] ?? {};
    const away = cs.find((c) => c.homeAway === 'away') ?? cs[1] ?? {};
    return {
      league,
      state: e.status?.type?.state ?? 'pre',
      desc: e.status?.type?.description ?? '',
      clock: e.status?.displayClock ?? '',
      date: new Date(e.date).getTime(),
      home: {
        name: home.team?.displayName ?? 'Home',
        abbr: home.team?.abbreviation ?? 'HOM',
        score: home.score ?? '',
      },
      away: {
        name: away.team?.displayName ?? 'Away',
        abbr: away.team?.abbreviation ?? 'AWY',
        score: away.score ?? '',
      },
    };
  }

  private fav(list: FEvent[]): FEvent | undefined {
    if (!this.favoriteTeams.length) {
      return undefined;
    }
    const favs = this.favoriteTeams.map((f) => f.toLowerCase());
    return list.find((e) =>
      favs.some(
        (f) =>
          e.home.name.toLowerCase().includes(f) ||
          e.away.name.toLowerCase().includes(f) ||
          e.home.abbr.toLowerCase() === f ||
          e.away.abbr.toLowerCase() === f
      )
    );
  }

  private toMatch(e: FEvent, live: FEvent[]): Match {
    const isLive = e.state === 'in';
    const isPre = e.state === 'pre';
    const day = new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const statusBarText = isLive
      ? `${e.home.abbr} ${e.home.score}-${e.away.score} ${e.away.abbr} ${e.clock}`
      : isPre
        ? `${e.home.abbr} v ${e.away.abbr} ${day}`
        : `${e.home.abbr} ${e.home.score}-${e.away.score} ${e.away.abbr} FT`;

    const others = live
      .filter((x) => x !== e)
      .slice(0, 4)
      .map((x) => ({
        left: `${x.home.abbr} v ${x.away.abbr}`,
        right: `${x.home.score}-${x.away.score} ${x.clock}`.trim(),
      }));

    const state = isLive ? 'live' : isPre ? 'upcoming' : 'idle';
    return {
      sport: 'football',
      state,
      emoji: this.emoji,
      statusBarText,
      tooltip: `${e.home.name} ${e.home.score}-${e.away.score} ${e.away.name} · ${e.league} · ${e.desc}`,
      detail: {
        sport: 'football',
        state,
        title: e.league,
        subtitle: isPre ? new Date(e.date).toLocaleString() : e.desc,
        teams: [
          { name: e.home.name, score: e.home.score || undefined },
          { name: e.away.name, score: e.away.score || undefined },
        ],
        meta: [{ label: 'Status', value: isLive ? `${e.desc} ${e.clock}`.trim() : e.desc, highlight: isLive }],
        others,
      },
    };
  }

  private idle(): Match {
    return {
      sport: 'football', state: 'idle', emoji: this.emoji,
      statusBarText: 'No matches', tooltip: 'No football right now',
      detail: { sport: 'football', state: 'idle', title: 'No football right now', teams: [], meta: [] },
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
