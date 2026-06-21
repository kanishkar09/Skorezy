import {
  Match,
  ScoreProvider,
  FootballMatchSummary,
  FootballStandings,
  FootballGroup,
  FootballStandingRow,
  FootballBracket,
  BracketRound,
  BracketMatch,
  FootballMatchDetail,
  TeamLineup,
  LineupPlayer,
  TimelineItem,
} from '../core/types';
import { fmtDateTime } from '../util/time';

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
  id: string;
  leagueCode: string;
  league: string;
  state: string; // 'pre' | 'in' | 'post'
  desc: string;
  clock: string;
  date: number;
  venue: string;
  clockSec: number;
  scorers: { time: string; name: string; note: string }[];
  home: { name: string; abbr: string; score: string; crest: string };
  away: { name: string; abbr: string; score: string; crest: string };
}

export class FootballProvider implements ScoreProvider {
  readonly id = 'football' as const;
  readonly emoji = '⚽';

  private standingsCache?: { at: number; league: string; data: FootballStandings };
  private bracketCache?: { at: number; league: string; data: FootballBracket };
  private mdCache: Record<string, { at: number; data: FootballMatchDetail }> = {};

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

      // Prefer a favourite's upcoming match only if it's soon (<48h); otherwise
      // show the soonest match overall (so the World Cup isn't hidden behind a
      // favourite's fixture weeks away).
      const favUpcoming = this.fav(upcoming);
      const soonFav = favUpcoming && favUpcoming.date - Date.now() < 48 * 60 * 60 * 1000;
      const chosen =
        this.fav(live) ??
        live[0] ??
        (soonFav ? favUpcoming : undefined) ??
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

  /**
   * League / tournament standings (group tables for the World Cup). Keyless
   * ESPN. Defaults to the FIFA World Cup. Cached 5 min.
   */
  async getStandings(league = 'fifa.world'): Promise<FootballStandings> {
    if (this.standingsCache && this.standingsCache.league === league && Date.now() - this.standingsCache.at < 300000) {
      return this.standingsCache.data;
    }
    const res = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json: any = await res.json();
    const leagueName = json.name ?? league;

    const parseEntries = (entries: any[]): FootballStandingRow[] =>
      (entries || [])
        .map((e: any) => {
          const stat = (n: string) => {
            const s = (e.stats || []).find((x: any) => x.name === n);
            return s ? String(s.displayValue ?? s.value ?? '') : '';
          };
          return {
            rank: stat('rank'),
            team: e.team?.displayName ?? e.team?.name ?? '—',
            played: stat('gamesPlayed'),
            win: stat('wins'),
            draw: stat('ties'),
            loss: stat('losses'),
            gd: stat('pointDifferential'),
            points: stat('points'),
          };
        })
        .sort((a, b) => (parseInt(a.rank) || 99) - (parseInt(b.rank) || 99));

    let groups: FootballGroup[] = [];
    if (json.children?.length) {
      groups = json.children.map((g: any) => ({
        name: g.name ?? 'Group',
        rows: parseEntries(g.standings?.entries),
      }));
    } else if (json.standings?.entries) {
      groups = [{ name: leagueName, rows: parseEntries(json.standings.entries) }];
    }

    const data: FootballStandings = { league: leagueName, groups };
    this.standingsCache = { at: Date.now(), league, data };
    return data;
  }

  /**
   * Knockout bracket for a tournament (defaults to the FIFA World Cup). Rounds
   * fill in with real teams/scores as the competition progresses. Cached 2 min.
   */
  async getBracket(league = 'fifa.world'): Promise<FootballBracket> {
    if (this.bracketCache && this.bracketCache.league === league && Date.now() - this.bracketCache.at < 30000) {
      return this.bracketCache.data;
    }
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const now = Date.now();
    const start = fmt(new Date(now - 3 * 86400000));
    const end = fmt(new Date(now + 60 * 86400000));
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${start}-${end}`
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json: any = await res.json();
    const events: any[] = json.events || [];

    const ORDER: [string, string][] = [
      ['round-of-32', 'Round of 32'],
      ['round-of-16', 'Round of 16'],
      ['quarterfinals', 'Quarterfinals'],
      ['semifinals', 'Semifinals'],
      ['final', 'Final'],
      ['3rd-place-match', '3rd Place'],
    ];

    const toTeam = (c: any) => ({
      name: c?.team?.displayName ?? c?.team?.name ?? 'TBD',
      crest: c?.team?.logo ?? '',
      score: c?.score ?? '',
      winner: !!c?.winner,
    });
    const toMatch = (e: any): BracketMatch => {
      const cs: any[] = e.competitions?.[0]?.competitors ?? [];
      const home = cs.find((c) => c.homeAway === 'home') ?? cs[0] ?? {};
      const away = cs.find((c) => c.homeAway === 'away') ?? cs[1] ?? {};
      return { home: toTeam(home), away: toTeam(away), state: e.status?.type?.state ?? 'pre' };
    };

    const rounds: BracketRound[] = ORDER.map(([slug, name]) => ({
      name,
      matches: events.filter((e) => e.season?.slug === slug).map(toMatch),
    })).filter((r) => r.matches.length);

    const data: FootballBracket = { league: json.leagues?.[0]?.name ?? league, rounds };
    this.bracketCache = { at: Date.now(), league, data };
    return data;
  }

  /** All matches across followed leagues (live first), for the match browser. */
  async getMatches(): Promise<FootballMatchSummary[]> {
    const lgs = this.leagues.length ? this.leagues : DEFAULT_LEAGUES;
    const results = await Promise.allSettled(lgs.map((l) => this.league(l)));
    const events: FEvent[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        events.push(...r.value);
      }
    }
    const rank = (s: string) => (s === 'in' ? 0 : s === 'pre' ? 1 : 2);
    events.sort((a, b) => {
      const r = rank(a.state) - rank(b.state);
      if (r !== 0) {
        return r;
      }
      // upcoming: soonest first; finished: most recent first
      return a.state === 'post' ? b.date - a.date : a.date - b.date;
    });

    return events.slice(0, 40).map((e) => ({
      league: e.league,
      state: e.state as 'pre' | 'in' | 'post',
      statusText:
        e.state === 'in'
          ? `${e.clock || e.desc}`.trim()
          : e.state === 'pre'
            ? new Date(e.date).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'FT',
      eventId: e.id,
      leagueCode: e.leagueCode,
      home: e.home,
      away: e.away,
    }));
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
    return (json.events || []).map((e: any) => this.parse(e, leagueName, code));
  }

  private parse(e: any, league: string, leagueCode: string): FEvent {
    const comp = e.competitions?.[0] ?? {};
    const cs: any[] = comp.competitors ?? [];
    const home = cs.find((c) => c.homeAway === 'home') ?? cs[0] ?? {};
    const away = cs.find((c) => c.homeAway === 'away') ?? cs[1] ?? {};
    const scorers = (comp.details ?? [])
      .filter((d: any) => /goal/i.test(d.type?.text ?? ''))
      .map((d: any) => {
        const text = d.type?.text ?? '';
        const note = /own/i.test(text) ? '(OG)' : /penalty|spot/i.test(text) ? '(pen)' : '';
        const name =
          (d.athletesInvolved ?? []).map((a: any) => a.displayName).filter(Boolean).join(', ') || 'Goal';
        return { time: d.clock?.displayValue ?? '', name, note };
      });
    return {
      id: String(e.id ?? ''),
      leagueCode,
      league,
      state: e.status?.type?.state ?? 'pre',
      desc: e.status?.type?.description ?? '',
      clock: e.status?.displayClock ?? '',
      date: new Date(e.date).getTime(),
      venue: comp.venue?.fullName ?? '',
      clockSec: typeof e.status?.clock === 'number' ? e.status.clock : 0,
      scorers,
      home: {
        name: home.team?.displayName ?? 'Home',
        abbr: home.team?.abbreviation ?? 'HOM',
        score: home.score ?? '',
        crest: home.team?.logo ?? home.team?.logos?.[0]?.href ?? '',
      },
      away: {
        name: away.team?.displayName ?? 'Away',
        abbr: away.team?.abbreviation ?? 'AWY',
        score: away.score ?? '',
        crest: away.team?.logo ?? away.team?.logos?.[0]?.href ?? '',
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

    // Prefer goal scorers in the "others" section; fall back to other live games.
    const goals = e.scorers ?? [];
    const others = goals.length
      ? goals.map((g) => ({ left: `${g.time}  ${g.name}`.trim(), right: g.note }))
      : live
          .filter((x) => x !== e)
          .slice(0, 4)
          .map((x) => ({
            left: `${x.home.abbr} v ${x.away.abbr}`,
            right: `${x.home.score}-${x.away.score} ${x.clock}`.trim(),
          }));
    const othersTitle = goals.length ? 'Goals' : 'Other live matches';

    const meta = [
      { label: 'Competition', value: e.league },
      { label: 'Status', value: isLive ? `${e.desc} ${e.clock}`.trim() : isPre ? 'Upcoming' : e.desc, highlight: isLive },
    ];
    if (e.venue) {
      meta.push({ label: 'Venue', value: e.venue, highlight: false });
    }

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
        title: `${e.home.name} vs ${e.away.name}`,
        subtitle: isPre ? `${e.league} · ${fmtDateTime(new Date(e.date))}` : `${e.league} · ${e.desc} ${isLive ? e.clock : ''}`.trim(),
        teams: [
          { name: e.home.name, score: e.home.score || undefined, crest: e.home.crest || undefined },
          { name: e.away.name, score: e.away.score || undefined, crest: e.away.crest || undefined },
        ],
        meta,
        others,
        othersTitle,
        countdownTo: isPre ? e.date : undefined,
        // Tick mm:ss only for a cleanly-running half (skip stoppage "+" and halftime).
        liveClockSec: isLive && e.clockSec > 0 && !e.clock.includes('+') ? e.clockSec : undefined,
        eventId: e.id || undefined,
        leagueCode: e.leagueCode || undefined,
      },
    };
  }

  /** Lineups + commentary timeline for a single match (ESPN summary). Cached 60s. */
  async getMatchDetail(leagueCode: string, eventId: string): Promise<FootballMatchDetail> {
    const cached = this.mdCache[eventId];
    if (cached && Date.now() - cached.at < 60000) {
      return cached.data;
    }
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventId}`
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json: any = await res.json();
    const rosters: any[] = json.rosters || [];
    const mkTeam = (r: any): TeamLineup => ({
      team: r?.team?.displayName ?? r?.team?.name ?? '',
      formation: r?.formation ?? '',
      players: (r?.roster || []).map(
        (p: any): LineupPlayer => ({
          num: String(p.jersey ?? ''),
          name: p.athlete?.displayName ?? '',
          pos: p.position?.abbreviation ?? '',
          starter: !!p.starter,
        })
      ),
    });
    const home = mkTeam(rosters.find((r) => r.homeAway === 'home') ?? rosters[0] ?? {});
    const away = mkTeam(rosters.find((r) => r.homeAway === 'away') ?? rosters[1] ?? {});
    const timeline: TimelineItem[] = (json.commentary || []).map((c: any) => ({
      time: c.time?.displayValue ?? '',
      text: c.text ?? '',
    }));
    const data: FootballMatchDetail = { eventId, home, away, timeline };
    this.mdCache[eventId] = { at: Date.now(), data };
    return data;
  }

  /** Human countdown to a future kickoff (epoch ms). */
  private countdown(target: number): string {
    const ms = target - Date.now();
    if (ms <= 0) {
      return 'soon';
    }
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
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
