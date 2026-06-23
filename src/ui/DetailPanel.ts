import * as vscode from 'vscode';
import {
  Match,
  TrackMapData,
  CricketScorecard,
  FootballMatchSummary,
  F1RaceItem,
  F1RaceResult,
  F1Standings,
  RaceControlMessage,
  FootballStandings,
  FootballBracket,
  FootballMatchDetail,
} from '../core/types';

export interface PanelLoaders {
  f1Map?: () => Promise<TrackMapData>;
  cricket?: () => Promise<CricketScorecard>;
  footballMatches?: () => Promise<FootballMatchSummary[]>;
  footballStandings?: () => Promise<FootballStandings>;
  footballBracket?: () => Promise<FootballBracket>;
  footballMatchDetail?: (leagueCode: string, eventId: string) => Promise<FootballMatchDetail>;
  f1Races?: () => Promise<F1RaceItem[]>;
  f1RaceResult?: (season: string, round: string) => Promise<F1RaceResult>;
  f1Standings?: () => Promise<F1Standings>;
  f1RaceControl?: () => Promise<RaceControlMessage[]>;
  refresh?: () => void;
}

/** Singleton webview panel showing full detail for all sports, with tabs. */
export class DetailPanel {
  private static current: DetailPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private latest: Match[] = [];
  private loaders: PanelLoaders;
  private disposables: vscode.Disposable[] = [];

  static show(matches: Match[], loaders: PanelLoaders = {}): void {
    if (DetailPanel.current) {
      DetailPanel.current.loaders = { ...DetailPanel.current.loaders, ...loaders };
      DetailPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      DetailPanel.current.setMatches(matches);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'skorezy.live',
      'Skorezy: Live',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    DetailPanel.current = new DetailPanel(panel, matches, loaders);
  }

  /** Push fresh data to an already-open panel (called by the poller). */
  static update(matches: Match[]): void {
    DetailPanel.current?.setMatches(matches);
  }

  private constructor(panel: vscode.WebviewPanel, matches: Match[], loaders: PanelLoaders) {
    this.panel = panel;
    this.latest = matches;
    this.loaders = loaders;
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg?.type === 'ready') {
          this.post();
        } else if (msg?.type === 'requestF1Map') {
          await this.sendMap();
        } else if (msg?.type === 'requestCricket') {
          await this.sendCricket();
        } else if (msg?.type === 'requestFootballMatches') {
          await this.sendLoader(this.loaders.footballMatches, 'footballMatches');
        } else if (msg?.type === 'requestFootballStandings') {
          await this.sendLoader(this.loaders.footballStandings, 'footballStandings');
        } else if (msg?.type === 'requestFootballBracket') {
          await this.sendLoader(this.loaders.footballBracket, 'footballBracket');
        } else if (msg?.type === 'requestFootballMatchDetail') {
          await this.sendLoader(
            this.loaders.footballMatchDetail
              ? () => this.loaders.footballMatchDetail!(msg.leagueCode, msg.eventId)
              : undefined,
            'footballMatchDetail'
          );
        } else if (msg?.type === 'requestF1Races') {
          await this.sendLoader(this.loaders.f1Races, 'f1Races');
        } else if (msg?.type === 'requestF1Standings') {
          await this.sendLoader(this.loaders.f1Standings, 'f1Standings');
        } else if (msg?.type === 'requestF1RaceControl') {
          await this.sendLoader(this.loaders.f1RaceControl, 'f1RaceControl');
        } else if (msg?.type === 'refresh') {
          this.loaders.refresh?.();
        } else if (msg?.type === 'requestF1RaceResult') {
          await this.sendLoader(
            this.loaders.f1RaceResult
              ? () => this.loaders.f1RaceResult!(msg.season, msg.round)
              : undefined,
            'f1RaceResult'
          );
        }
      },
      null,
      this.disposables
    );
  }

  /** Generic loader → posts `{type}` with data, or `{type}Error` on failure. */
  private async sendLoader(loader: (() => Promise<any>) | undefined, type: string): Promise<void> {
    if (!loader) {
      this.panel.webview.postMessage({ type: `${type}Error`, message: 'Not available' });
      return;
    }
    try {
      const data = await loader();
      this.panel.webview.postMessage({ type, data });
    } catch (err: any) {
      this.panel.webview.postMessage({
        type: `${type}Error`,
        message: err?.message ?? 'Failed to load',
      });
    }
  }

  private async sendMap(): Promise<void> {
    if (!this.loaders.f1Map) {
      this.panel.webview.postMessage({ type: 'f1MapError', message: 'Map not available' });
      return;
    }
    try {
      const data = await this.loaders.f1Map();
      this.panel.webview.postMessage({ type: 'f1Map', data });
    } catch (err: any) {
      this.panel.webview.postMessage({
        type: 'f1MapError',
        message: err?.message ?? 'Failed to load track map',
      });
    }
  }

  private async sendCricket(): Promise<void> {
    if (!this.loaders.cricket) {
      this.panel.webview.postMessage({ type: 'cricketError', message: 'Scorecard not available' });
      return;
    }
    try {
      const data = await this.loaders.cricket();
      this.panel.webview.postMessage({ type: 'cricket', data });
    } catch (err: any) {
      this.panel.webview.postMessage({
        type: 'cricketError',
        message: err?.message ?? 'Failed to load scorecard',
      });
    }
  }

  private setMatches(matches: Match[]): void {
    this.latest = matches;
    this.post();
  }

  private post(): void {
    this.panel.webview.postMessage({ type: 'update', matches: this.latest });
  }

  private html(): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
    background: var(--vscode-editor-background); padding: 0; margin: 0; font-size: 13px; }
  .tabs { display:flex; border-bottom:1px solid var(--vscode-panel-border); position:sticky; top:0;
    background: var(--vscode-editor-background); }
  .tab { flex:1; text-align:center; padding:10px 4px; cursor:pointer; color:var(--vscode-descriptionForeground);
    border-bottom:2px solid transparent; }
  .tab.active { color:var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }
  .body { padding:16px; }
  .card { background: var(--vscode-editorWidget-background); border:1px solid var(--vscode-panel-border);
    border-radius:8px; padding:14px; margin-bottom:14px; }
  .badge { display:inline-flex; align-items:center; gap:6px; font-size:10px; padding:2px 8px; border-radius:10px;
    text-transform:uppercase; letter-spacing:.5px; }
  .badge.live { background:#c0392b; color:#fff; animation:liveGlow 1.6s ease-in-out infinite; }
  @keyframes liveGlow {
    0%, 100% { box-shadow:0 0 0 0 rgba(224,56,59,0); }
    50% { box-shadow:0 0 12px 2px rgba(224,56,59,0.85); }
  }
  .badge.upcoming { background:#2980b9; color:#fff; }
  .badge.idle { background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
  .badge.error { background:#b9770e; color:#fff; }
  .dot { width:6px; height:6px; border-radius:50%; background:#fff; animation:pulse 1.2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  .sub { color:var(--vscode-descriptionForeground); font-size:11px; margin:8px 0 12px; }
  .team { display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:14px; }
  .team.dim { opacity:.55; }
  .team .score { font-weight:600; }
  .meta { display:flex; flex-wrap:wrap; gap:14px; margin-top:12px; padding-top:12px;
    border-top:1px solid var(--vscode-panel-border); }
  .meta .lbl { display:block; font-size:10px; color:var(--vscode-descriptionForeground); margin-bottom:2px; }
  .meta .val { font-size:13px; } .meta .val.hi { color: var(--vscode-textLink-foreground); font-weight:600; }
  .balls { display:flex; gap:5px; align-items:center; margin-top:12px; }
  .balls .lbl { font-size:10px; color:var(--vscode-descriptionForeground); margin-right:4px; }
  .ball { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    font-size:11px; font-weight:600; background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
  .ball.four{background:#2980b9;color:#fff} .ball.six{background:#27ae60;color:#fff} .ball.w{background:#c0392b;color:#fff}
  .sectitle { font-size:11px; text-transform:uppercase; letter-spacing:.5px;
    color:var(--vscode-descriptionForeground); margin:6px 0 8px; }
  .mini { display:flex; justify-content:space-between; padding:6px 0;
    border-bottom:1px solid var(--vscode-panel-border); font-size:12px; }
  .empty { color:var(--vscode-descriptionForeground); padding:24px; text-align:center; }
  /* F1 sub-toggle */
  .subtoggle { display:flex; gap:6px; margin-bottom:12px; }
  .subtoggle button { flex:1; padding:6px 10px; font-size:12px; cursor:pointer; border-radius:6px;
    border:1px solid var(--vscode-panel-border); background:var(--vscode-editorWidget-background);
    color:var(--vscode-foreground); }
  .subtoggle button.active { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
    border-color:var(--vscode-button-background); }
  /* Track map */
  .mapwrap { display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }
  #track { background:var(--vscode-editorWidget-background); border:1px solid var(--vscode-panel-border);
    border-radius:8px; flex:1; min-width:220px; }
  .grid { font-size:11px; min-width:150px; flex:1; }
  .grid .pos { display:flex; align-items:center; gap:6px; padding:3px 0;
    border-bottom:1px solid var(--vscode-panel-border); }
  .grid .swatch { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
  .grid .pnum { width:16px; color:var(--vscode-descriptionForeground); text-align:right; }
  .grid .acr { font-weight:600; width:34px; }
  .grid .gap { margin-left:auto; color:var(--vscode-descriptionForeground); font-variant-numeric:tabular-nums; }
  .grid .tyre { width:16px; height:16px; border-radius:50%; font-size:9px; font-weight:700;
    display:flex; align-items:center; justify-content:center; color:#000; flex-shrink:0; }
  .maptitle { font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:8px; }
  .replaybadge { display:inline-block; font-size:9px; padding:1px 6px; border-radius:8px;
    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); margin-left:6px; }
  .replaybadge.livebadge { background:#c0392b; color:#fff; animation:liveGlow 1.6s ease-in-out infinite; }
  /* Cricket scorecard */
  .toss { font-size:11px; color:var(--vscode-descriptionForeground); margin:4px 0 2px; }
  .venue { font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:8px; }
  .sc-inning { font-size:12px; font-weight:600; margin:14px 0 6px; padding-bottom:4px;
    border-bottom:1px solid var(--vscode-focusBorder); }
  table.sc { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:6px; }
  table.sc th { text-align:right; color:var(--vscode-descriptionForeground); font-weight:500;
    padding:3px 5px; border-bottom:1px solid var(--vscode-panel-border); }
  table.sc th.name, table.sc td.name { text-align:left; }
  table.sc td { padding:3px 5px; border-bottom:1px solid var(--vscode-panel-border); text-align:right; }
  table.sc td .out { display:block; color:var(--vscode-descriptionForeground); font-size:9px; }
  .notout { color:#27ae60; font-weight:600; }
  .refreshbtn { float:right; font-size:11px; cursor:pointer; padding:2px 8px; border-radius:5px;
    border:1px solid var(--vscode-panel-border); background:var(--vscode-editorWidget-background);
    color:var(--vscode-foreground); }
  /* Clickable lists (match browser / race browser) */
  .listrow { display:flex; align-items:center; gap:8px; padding:7px 8px; cursor:pointer;
    border-bottom:1px solid var(--vscode-panel-border); border-radius:4px; }
  .listrow:hover { background:var(--vscode-list-hoverBackground); }
  .listrow .lg { font-size:9px; color:var(--vscode-descriptionForeground); width:46px; flex-shrink:0; }
  .listrow .mt { flex:1; }
  .listrow .st { font-size:10px; color:var(--vscode-descriptionForeground); text-align:right; }
  .livedot { width:7px; height:7px; border-radius:50%; background:#c0392b; display:inline-block; margin-right:3px; }
  .backbtn { cursor:pointer; font-size:12px; color:var(--vscode-textLink-foreground);
    margin-bottom:10px; display:inline-block; }
  table.results { width:100%; border-collapse:collapse; font-size:11px; }
  table.results td, table.results th { padding:4px 5px; border-bottom:1px solid var(--vscode-panel-border); text-align:left; }
  table.results td.p { width:26px; text-align:right; color:var(--vscode-descriptionForeground); }
  table.results td.rt { text-align:right; color:var(--vscode-descriptionForeground); }
  /* Race control feed */
  .rcrow { display:flex; align-items:flex-start; gap:8px; padding:6px 4px;
    border-bottom:1px solid var(--vscode-panel-border); font-size:11px; }
  .rcflag { width:8px; height:8px; border-radius:2px; flex-shrink:0; margin-top:3px;
    border:1px solid rgba(255,255,255,0.25); }
  .rclap { width:26px; flex-shrink:0; color:var(--vscode-descriptionForeground); font-variant-numeric:tabular-nums; }
  .rcmsg { flex:1; line-height:1.35; }
  /* Football hero scoreboard */
  .fbhero { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:16px 4px 8px; }
  .fbteam { flex:1; display:flex; flex-direction:column; align-items:center; gap:8px; min-width:0; }
  .fbteam img { width:52px; height:52px; object-fit:contain; }
  .fbteam .crestph { width:52px; height:52px; border-radius:50%; background:var(--vscode-badge-background);
    display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; color:var(--vscode-badge-foreground); }
  .fbteam .nm { font-size:12px; text-align:center; line-height:1.2; }
  .fbmid { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:80px; }
  .fbmid .sc { font-size:30px; font-weight:800; letter-spacing:1px; }
  .fbmid .vs { font-size:18px; font-weight:700; color:var(--vscode-descriptionForeground); }
  .fbmid .clk { font-size:10px; color:var(--vscode-textLink-foreground); font-weight:600; }
  .fbmid .livetimer { font-size:11px; color:#fff; background:#c0392b; padding:1px 8px; border-radius:9px;
    display:inline-flex; align-items:center; gap:5px; margin-bottom:4px; font-weight:600;
    animation:liveGlow 1.6s ease-in-out infinite; }
  .fbmid .livetimer .ld { width:5px; height:5px; border-radius:50%; background:#fff; animation:pulse 1.2s infinite; }
  /* Match page: pitch lineup + timeline */
  .mdgrid { display:flex; flex-wrap:wrap; gap:12px; margin-top:12px; }
  .pitchwrap { flex:1; min-width:230px; }
  .tlwrap { flex:1; min-width:210px; max-height:420px; overflow:auto; }
  .pitch { position:relative; width:100%; height:420px; border:2px solid rgba(255,255,255,.25); border-radius:8px;
    overflow:hidden; background:repeating-linear-gradient(#1f7a33 0 36px, #1c7030 36px 72px); }
  .pitch .pmid { position:absolute; top:50%; left:0; right:0; height:2px; background:rgba(255,255,255,.3); }
  .pitch .pcirc { position:absolute; top:50%; left:50%; width:64px; height:64px; border:2px solid rgba(255,255,255,.3);
    border-radius:50%; transform:translate(-50%,-50%); }
  .pdot { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:1px; }
  .pdot .pnum { width:21px; height:21px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    font-size:10px; font-weight:700; color:#fff; border:1px solid rgba(255,255,255,.7); }
  .pdot.home .pnum { background:#2563eb; } .pdot.away .pnum { background:#dc2626; }
  .pdot .plab { font-size:8px; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.85); white-space:nowrap;
    max-width:56px; overflow:hidden; text-overflow:ellipsis; }
  .pkey { display:flex; justify-content:space-between; gap:8px; font-size:10px;
    color:var(--vscode-descriptionForeground); margin-top:6px; }
  .pdotmini { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px; }
  .pdotmini.home { background:#2563eb; } .pdotmini.away { background:#dc2626; }
  .tlrow { display:flex; gap:8px; padding:5px 2px; font-size:11px; border-bottom:1px solid var(--vscode-panel-border); }
  .tlrow .tlt { width:30px; flex-shrink:0; color:var(--vscode-textLink-foreground); font-variant-numeric:tabular-nums; }
  .tlrow .tltext { flex:1; line-height:1.35; }
  /* Goal celebration */
  .confetti-piece { position:fixed; top:-12px; width:8px; height:14px; border-radius:2px; z-index:9999;
    pointer-events:none; animation:ccfall 1.9s linear forwards; }
  @keyframes ccfall { 0%{ transform:translateY(0) rotate(0); opacity:1; } 100%{ transform:translateY(115vh) rotate(560deg); opacity:.15; } }
  .goalbanner { position:fixed; top:26%; left:50%; z-index:10000; font-size:30px; font-weight:800; color:#fff;
    text-shadow:0 2px 14px rgba(0,0,0,.65); pointer-events:none; white-space:nowrap; animation:gpop 1.9s ease forwards; }
  @keyframes gpop {
    0%{ opacity:0; transform:translateX(-50%) scale(0.4); }
    15%{ opacity:1; transform:translateX(-50%) scale(1.18); }
    32%{ transform:translateX(-50%) scale(1); }
    80%{ opacity:1; transform:translateX(-50%) scale(1) translateY(0); }
    100%{ opacity:0; transform:translateX(-50%) scale(1) translateY(-24px); }
  }
  .fbmeta { display:flex; flex-wrap:wrap; gap:6px 16px; padding:4px 2px 0; }
  .fbmeta div .l { font-size:9px; color:var(--vscode-descriptionForeground); display:block; }
  .fbmeta div .v { font-size:12px; }
  /* Immersive matches list */
  .fbgrp { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:var(--vscode-descriptionForeground);
    margin:14px 0 6px; display:flex; align-items:center; gap:6px; }
  .fbmrow { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--vscode-panel-border);
    border-radius:7px; margin-bottom:6px; cursor:pointer; }
  .fbmrow:hover { background:var(--vscode-list-hoverBackground); }
  .fbmrow .side { flex:1; display:flex; align-items:center; gap:6px; min-width:0; font-size:12px; }
  .fbmrow .side.away { flex-direction:row-reverse; }
  .fbmrow .side img { width:18px; height:18px; object-fit:contain; flex-shrink:0; }
  .fbmrow .side .tn { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .fbmrow .mid { display:flex; flex-direction:column; align-items:center; min-width:54px; }
  .fbmrow .mid .sc { font-size:14px; font-weight:700; }
  .fbmrow .mid .vs { font-size:11px; color:var(--vscode-descriptionForeground); }
  .fbmrow .mid .st { font-size:8.5px; color:var(--vscode-descriptionForeground); margin-top:1px; }
  .fbmrow .mid .st.live { color:#fff; background:#c0392b; padding:0 5px; border-radius:8px; }
  /* Knockout bracket with connector lines */
  .bracketwrap { overflow-x:auto; padding-bottom:10px; }
  .bracket { display:flex; min-width:max-content; align-items:stretch; }
  .bround { display:flex; flex-direction:column; width:150px; margin-right:24px; }
  .bround:last-child { margin-right:0; }
  .bround .brt { font-size:10px; text-transform:uppercase; letter-spacing:.5px;
    color:var(--vscode-descriptionForeground); text-align:center; margin-bottom:6px; }
  .bslots { display:flex; flex-direction:column; justify-content:space-around; flex:1; }
  .bslot { flex:1; display:flex; align-items:center; position:relative; }
  .btie { width:150px; position:relative; background:var(--vscode-editorWidget-background);
    border:1px solid var(--vscode-panel-border); border-radius:6px; overflow:hidden; }
  /* right stub out of each match (not the last round) */
  .bround:not(:last-child) .bslot::after { content:''; position:absolute; left:100%; top:50%;
    width:12px; height:2px; background:var(--vscode-panel-border); }
  /* vertical line joining each pair (odd slot, at mid-gap) */
  .bround:not(:last-child) .bslot:nth-child(odd):not(:last-child)::before { content:''; position:absolute;
    left:calc(100% + 12px); top:50%; width:2px; height:100%; background:var(--vscode-panel-border); }
  /* left stub into each match (not the first round) */
  .bround:not(:first-child) .btie::before { content:''; position:absolute; right:100%; top:50%;
    width:12px; height:2px; background:var(--vscode-panel-border); }
  .brow { display:flex; justify-content:space-between; align-items:center; gap:6px; padding:5px 8px; font-size:11px; }
  .brow + .brow { border-top:1px solid var(--vscode-panel-border); }
  .brow.win { color:var(--vscode-foreground); font-weight:600; }
  .brow.win .bs { color:#4ec9b0; }
  .brow .bt { display:flex; align-items:center; gap:5px; overflow:hidden; white-space:nowrap; }
  .brow .bt img { width:16px; height:16px; object-fit:contain; flex-shrink:0; }
  .brow .bn { overflow:hidden; text-overflow:ellipsis; }
  .brow .bs { color:var(--vscode-descriptionForeground); flex-shrink:0; }
</style>
</head>
<body>
  <div class="tabs" id="tabs"></div>
  <div class="body" id="body"><div class="empty">Loading scores…</div></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let matches = [];
  let active = 0;

  function renderTabs() {
    const tabs = document.getElementById('tabs');
    tabs.innerHTML = '';
    matches.forEach((m, i) => {
      const el = document.createElement('div');
      el.className = 'tab' + (i === active ? ' active' : '');
      el.textContent = m.emoji + ' ' + cap(m.sport);
      el.onclick = () => { active = i; render(); };
      tabs.appendChild(el);
    });
  }

  function cap(s){ return s === 'f1' ? 'F1' : s.charAt(0).toUpperCase() + s.slice(1); }

  function render() {
    renderTabs();
    const body = document.getElementById('body');
    const m = matches[active];
    if (!m) { body.innerHTML = '<div class="empty">No data</div>'; return; }
    stopAnim(); stopCricketTimer(); stopMapTimer(); stopFbMatchesTimer(); stopFbBracketTimer();
    if (m.sport === 'f1') { renderF1(m); return; }
    if (m.sport === 'cricket') { renderCricket(m); return; }
    if (m.sport === 'football') { renderFootball(m); return; }
    body.innerHTML = buildDetail(m.detail);
  }

  function crestImg(team) {
    if (team && team.crest) { return '<img src="' + esc(team.crest) + '" alt="">'; }
    const ab = ((team && team.name) || '?').replace(/[^A-Za-z]/g,'').slice(0, 3).toUpperCase() || '?';
    return '<div class="crestph">' + esc(ab) + '</div>';
  }

  // Rich football card: crests + big scoreline (or VS), status, meta chips, goals.
  function buildFootballDetail(d) {
    const h = (d.teams && d.teams[0]) || { name: '?' };
    const a = (d.teams && d.teams[1]) || { name: '?' };
    const hasScore = h.score != null && h.score !== '';
    let html = '<div class="card">';
    html += badge(d.state);
    if (d.subtitle) { html += '<div class="sub">' + esc(d.subtitle) + '</div>'; }
    html += '<div class="fbhero">';
    html += '<div class="fbteam">' + crestImg(h) + '<span class="nm">' + esc(h.name) + '</span></div>';
    const isLive = d.state === 'live';
    const statusRow = (d.meta || []).find((m) => m.label === 'Status');
    html += '<div class="fbmid">';
    // Live match clock shown prominently ABOVE the score (ticking mm:ss when running).
    if (isLive) {
      const inner = d.liveClockSec != null ? ltSpan(d.liveClockSec) : esc(statusRow ? statusRow.value : 'LIVE');
      html += '<span class="livetimer"><span class="ld"></span>' + inner + '</span>';
    }
    html += hasScore ? '<span class="sc">' + esc(h.score) + ' - ' + esc(a.score) + '</span>'
                     : '<span class="vs">VS</span>';
    if (!isLive && statusRow) { html += '<span class="clk">' + esc(statusRow.value) + '</span>'; }
    html += '</div>';
    html += '<div class="fbteam">' + crestImg(a) + '<span class="nm">' + esc(a.name) + '</span></div>';
    html += '</div></div>';
    const chips = (d.meta || []).filter((m) => m.label !== 'Status');
    if (chips.length || d.countdownTo) {
      html += '<div class="fbmeta">';
      if (d.countdownTo) {
        html += '<div><span class="l">Kicks off in</span><span class="v">' + cdSpan(d.countdownTo) + '</span></div>';
      }
      chips.forEach((m) => { html += '<div><span class="l">' + esc(m.label) + '</span><span class="v">' + esc(m.value) + '</span></div>'; });
      html += '</div>';
    }
    if ((d.others || []).length) {
      html += '<div class="sectitle" style="margin-top:12px">' + esc(d.othersTitle || 'Also happening') + '</div>';
      d.others.forEach((o) => { html += '<div class="mini"><span>' + esc(o.left) + '</span><span>' + esc(o.right) + '</span></div>'; });
    }
    return html;
  }

  // ---- Football: Featured match + All Matches browser + Standings ----
  let fbView = 'featured'; // featured | all | standings
  let fbMatches = null, fbStatus = 'idle', fbError = '', fbSelected = null;
  let fbStandings = null, fbStStatus = 'idle', fbStError = '';
  let fbBracket = null, fbBrStatus = 'idle', fbBrError = '';
  let fbMd = 'summary'; // summary | lineups | timeline
  let fbMdCache = {}, fbMdStatus = 'idle';

  function fbSummaryToDetail(e) {
    const state = e.state === 'in' ? 'live' : e.state === 'pre' ? 'upcoming' : 'idle';
    return {
      state,
      subtitle: e.league + ' · ' + e.statusText,
      teams: [
        { name: e.home.name, score: e.home.score || undefined, crest: e.home.crest },
        { name: e.away.name, score: e.away.score || undefined, crest: e.away.crest },
      ],
      meta: [{ label: 'Competition', value: e.league }, { label: 'Status', value: e.statusText }],
      others: [],
      eventId: e.eventId,
      leagueCode: e.leagueCode,
    };
  }

  // Match page: score card + lineup-on-pitch + timeline (loaded together).
  function renderFbMatch(d, fb, backLabel) {
    let html = '';
    if (backLabel) { html += '<span class="backbtn" id="fb-back">← ' + esc(backLabel) + '</span>'; }
    html += buildFootballDetail(d);            // score card on top
    if (d.eventId) { html += '<div id="mdextra"></div>'; }
    fb.innerHTML = html;
    if (backLabel) { document.getElementById('fb-back').onclick = () => { fbSelected = null; render(); }; }
    if (!d.eventId) { return; }
    const ex = document.getElementById('mdextra');
    const md = fbMdCache[d.eventId];
    if (!md) {
      if (fbMdStatus !== 'loading') { fbMdStatus = 'loading'; vscode.postMessage({ type: 'requestFootballMatchDetail', leagueCode: d.leagueCode, eventId: d.eventId }); }
      ex.innerHTML = '<div class="empty">Loading lineups & commentary…</div>';
      return;
    }
    ex.innerHTML =
      '<div class="mdgrid">' +
        '<div class="pitchwrap">' + buildPitch(md) + '</div>' +
        '<div class="tlwrap"><div class="sectitle">Timeline / commentary</div>' + buildTimeline(md) + '</div>' +
      '</div>';
  }

  function lastName(n){ const p = (n || '').trim().split(' '); return p[p.length - 1] || n || ''; }

  // Compute on-pitch x/y (%) for each starter from the formation string.
  function pitchPositions(team, isHome) {
    const starters = (team.players || []).filter((p) => p.starter).slice(0, 11);
    if (!starters.length) { return []; }
    const lines = (team.formation || '').split('-').map((n) => parseInt(n)).filter((n) => n > 0);
    const rows = [[starters[0]]]; // GK
    let idx = 1;
    if (lines.length) {
      lines.forEach((c) => { rows.push(starters.slice(idx, idx + c)); idx += c; });
      // Any leftover players join the last line (spread out) — never stacked in a new row.
      if (idx < starters.length) { rows[rows.length - 1] = rows[rows.length - 1].concat(starters.slice(idx)); }
    } else {
      // No formation info: GK + everyone else evenly in one outfield row.
      rows.push(starters.slice(1));
    }
    const n = rows.length;
    const out = [];
    rows.forEach((row, ri) => {
      const frac = n > 1 ? ri / (n - 1) : 0; // 0 = GK, 1 = most attacking
      // Keep each team in its own half so the two attacking lines never collide at the halfway line.
      const y = isHome ? 93 - frac * 36 : 7 + frac * 36;
      row.forEach((p, pi) => { out.push({ p, x: ((pi + 1) / (row.length + 1)) * 100, y }); });
    });
    return out;
  }

  function buildPitch(md) {
    const home = pitchPositions(md.home, true), away = pitchPositions(md.away, false);
    if (!home.length && !away.length) { return '<div class="empty">Lineups not announced yet</div>'; }
    const dots = (arr, cls) => arr.map((o) =>
      '<div class="pdot ' + cls + '" style="left:' + o.x.toFixed(1) + '%;top:' + o.y.toFixed(1) + '%">' +
      '<span class="pnum">' + esc(o.p.num) + '</span><span class="plab">' + esc(lastName(o.p.name)) + '</span></div>').join('');
    return '<div class="pitch"><div class="pmid"></div><div class="pcirc"></div>' +
      dots(home, 'home') + dots(away, 'away') + '</div>' +
      '<div class="pkey">' +
        '<span><span class="pdotmini home"></span>' + esc(md.home.team) + (md.home.formation ? ' ' + esc(md.home.formation) : '') + '</span>' +
        '<span><span class="pdotmini away"></span>' + esc(md.away.team) + (md.away.formation ? ' ' + esc(md.away.formation) : '') + '</span>' +
      '</div>';
  }

  function buildTimeline(md) {
    if (!md.timeline || !md.timeline.length) { return '<div class="empty">No commentary yet</div>'; }
    let h = '';
    md.timeline.slice().reverse().forEach((t) => {
      h += '<div class="tlrow"><span class="tlt">' + esc(t.time) + '</span><span class="tltext">' + esc(t.text) + '</span></div>';
    });
    return h;
  }
  let fbMatchesTimer = null, fbBracketTimer = null;
  function stopFbMatchesTimer() { if (fbMatchesTimer) { clearInterval(fbMatchesTimer); fbMatchesTimer = null; } }
  function startFbMatchesTimer() {
    stopFbMatchesTimer();
    fbMatchesTimer = setInterval(() => {
      if (!document.hidden && matches[active] && matches[active].sport === 'football'
          && fbView === 'all' && !fbSelected) {
        vscode.postMessage({ type: 'requestFootballMatches' }); // silent refresh
      }
    }, 45000);
  }
  function stopFbBracketTimer() { if (fbBracketTimer) { clearInterval(fbBracketTimer); fbBracketTimer = null; } }
  function startFbBracketTimer() {
    stopFbBracketTimer();
    fbBracketTimer = setInterval(() => {
      if (!document.hidden && matches[active] && matches[active].sport === 'football' && fbView === 'bracket') {
        vscode.postMessage({ type: 'requestFootballBracket' }); // silent refresh — bracket fills in live
      }
    }, 60000);
  }

  function renderFootball(m) {
    const body = document.getElementById('body');
    body.innerHTML = '<div class="subtoggle">' +
      '<button id="fb-feat" class="' + (fbView==='featured'?'active':'') + '">⭐ Featured</button>' +
      '<button id="fb-all" class="' + (fbView==='all'?'active':'') + '">📋 Matches</button>' +
      '<button id="fb-st" class="' + (fbView==='standings'?'active':'') + '">📊 Table</button>' +
      '<button id="fb-br" class="' + (fbView==='bracket'?'active':'') + '">🏆 Bracket</button>' +
      '</div><div id="fbbody"></div>';
    document.getElementById('fb-feat').onclick = () => { fbView='featured'; fbSelected=null; render(); };
    document.getElementById('fb-all').onclick = () => { fbView='all'; render(); };
    document.getElementById('fb-st').onclick = () => { fbView='standings'; render(); };
    document.getElementById('fb-br').onclick = () => { fbView='bracket'; render(); };
    const fb = document.getElementById('fbbody');
    if (fbView === 'featured') { renderFbMatch(m.detail, fb); return; }
    if (fbView === 'standings') { renderFootballStandings(fb); return; }
    if (fbView === 'bracket') { renderFootballBracket(fb); return; }
    if (fbSelected) { renderFbMatch(fbSummaryToDetail(fbSelected), fb, 'All matches'); return; }
    if (fbStatus === 'idle') { fbStatus='loading'; vscode.postMessage({ type:'requestFootballMatches' }); }
    if (fbStatus === 'loading') { fb.innerHTML = '<div class="empty">Loading matches…</div>'; return; }
    if (fbStatus === 'error') { fb.innerHTML = '<div class="empty">⚠ ' + esc(fbError) + '</div>'; return; }
    if (!fbMatches || !fbMatches.length) { fb.innerHTML = '<div class="empty">No matches found</div>'; return; }
    // Group by competition, preserving the live-first order.
    const groups = {}, order = [];
    fbMatches.forEach((e, i) => {
      if (!groups[e.league]) { groups[e.league] = []; order.push(e.league); }
      groups[e.league].push({ e, i });
    });
    const crest = (t) => t.crest ? '<img src="' + esc(t.crest) + '">' : '';
    let html = '';
    order.forEach((lg) => {
      const liveN = groups[lg].filter((x) => x.e.state === 'in').length;
      html += '<div class="fbgrp">' + esc(lg) + (liveN ? ' <span class="livedot"></span>' + liveN + ' live' : '') + '</div>';
      groups[lg].forEach(({ e, i }) => {
        let mid;
        if (e.state === 'in') {
          mid = '<span class="sc">' + esc(e.home.score) + '-' + esc(e.away.score) + '</span><span class="st live">' + esc(e.statusText) + '</span>';
        } else if (e.state === 'post') {
          mid = '<span class="sc">' + esc(e.home.score) + '-' + esc(e.away.score) + '</span><span class="st">FT</span>';
        } else {
          mid = '<span class="vs">v</span><span class="st">' + esc(e.statusText) + '</span>';
        }
        html += '<div class="fbmrow" data-i="' + i + '">' +
          '<div class="side">' + crest(e.home) + '<span class="tn">' + esc(e.home.name) + '</span></div>' +
          '<div class="mid">' + mid + '</div>' +
          '<div class="side away">' + crest(e.away) + '<span class="tn">' + esc(e.away.name) + '</span></div>' +
          '</div>';
      });
    });
    fb.innerHTML = html;
    fb.querySelectorAll('.fbmrow').forEach((el) => {
      el.onclick = () => { fbSelected = fbMatches[+el.getAttribute('data-i')]; render(); };
    });
    startFbMatchesTimer(); // keep scores fresh while the list is open
  }

  // Clicked match → reuse the rich hero card.
  function fbMatchDetail(e) {
    const state = e.state === 'in' ? 'live' : e.state === 'pre' ? 'upcoming' : 'idle';
    const detail = {
      state,
      subtitle: e.league + ' · ' + e.statusText,
      teams: [
        { name: e.home.name, score: e.home.score || undefined, crest: e.home.crest },
        { name: e.away.name, score: e.away.score || undefined, crest: e.away.crest },
      ],
      meta: [
        { label: 'Competition', value: e.league },
        { label: 'Status', value: e.statusText },
      ],
      others: [],
    };
    return buildFootballDetail(detail);
  }

  function renderFootballBracket(fb) {
    if (fbBrStatus === 'idle') { fbBrStatus='loading'; vscode.postMessage({ type:'requestFootballBracket' }); }
    if (fbBrStatus === 'loading' && !fbBracket) { fb.innerHTML = '<div class="empty">Loading bracket…</div>'; return; }
    if (fbBrStatus === 'error') { fb.innerHTML = '<div class="empty">⚠ ' + esc(fbBrError) + '</div>'; return; }
    if (!fbBracket || !fbBracket.rounds.length) { fb.innerHTML = '<div class="empty">Knockout bracket starts after the group stage 🏆</div>'; return; }
    const bteam = (t) => {
      const crest = t.crest ? '<img src="' + esc(t.crest) + '">' : '';
      return '<div class="brow' + (t.winner ? ' win' : '') + '"><span class="bt">' + crest +
        '<span class="bn">' + esc(t.name) + '</span></span><span class="bs">' + esc(t.score) + '</span></div>';
    };
    let html = '<div class="maptitle">' + esc(fbBracket.league) + ' · knockout</div>';
    html += '<div class="bracketwrap"><div class="bracket">';
    fbBracket.rounds.forEach((r) => {
      html += '<div class="bround"><div class="brt">' + esc(r.name) + '</div><div class="bslots">';
      r.matches.forEach((mt) => {
        html += '<div class="bslot"><div class="btie">' + bteam(mt.home) + bteam(mt.away) + '</div></div>';
      });
      html += '</div></div>';
    });
    html += '</div></div>';
    fb.innerHTML = html;
    startFbBracketTimer(); // keep the bracket fresh as knockout results come in
  }

  function renderFootballStandings(fb) {
    if (fbStStatus === 'idle') { fbStStatus='loading'; vscode.postMessage({ type:'requestFootballStandings' }); }
    if (fbStStatus === 'loading') { fb.innerHTML = '<div class="empty">Loading standings…</div>'; return; }
    if (fbStStatus === 'error') { fb.innerHTML = '<div class="empty">⚠ ' + esc(fbStError) + '</div>'; return; }
    if (!fbStandings || !fbStandings.groups.length) { fb.innerHTML = '<div class="empty">No standings available</div>'; return; }
    let html = '<div class="maptitle">' + esc(fbStandings.league) + '</div>';
    fbStandings.groups.forEach((g) => {
      if (!g.rows.length) return;
      html += '<div class="sc-inning">' + esc(g.name) + '</div>';
      html += '<table class="results"><tr><th class="p">#</th><th>Team</th><th class="rt">P</th><th class="rt">GD</th><th class="rt">Pts</th></tr>';
      g.rows.forEach((r) => {
        html += '<tr><td class="p">' + esc(r.rank) + '</td><td>' + esc(r.team) + '</td>' +
          '<td class="rt">' + esc(r.played) + '</td><td class="rt">' + esc(r.gd) + '</td>' +
          '<td class="rt">' + esc(r.points) + '</td></tr>';
      });
      html += '</table>';
    });
    fb.innerHTML = html;
  }

  // Auto-refresh timers (paused when the panel is hidden).
  let cricTimer = null, mapTimer = null;
  function stopCricketTimer() { if (cricTimer) { clearInterval(cricTimer); cricTimer = null; } }
  function startCricketTimer() {
    stopCricketTimer();
    cricTimer = setInterval(() => {
      if (!document.hidden && matches[active] && matches[active].sport === 'cricket') {
        vscode.postMessage({ type: 'requestCricket' }); // silent: keep showing data until new arrives
      }
    }, 45000);
  }
  function stopMapTimer() { if (mapTimer) { clearInterval(mapTimer); mapTimer = null; } }
  function startMapTimer() {
    stopMapTimer();
    mapTimer = setInterval(() => {
      if (!document.hidden && f1View === 'map') {
        vscode.postMessage({ type: 'requestF1Map' });
      }
    }, 30000);
  }

  function buildDetail(d) {
    let html = '<div class="card">';
    html += badge(d.state);
    if (d.subtitle) html += '<div class="sub">' + esc(d.title) + ' · ' + esc(d.subtitle) + '</div>';
    else html += '<div class="sub">' + esc(d.title) + '</div>';
    (d.teams||[]).forEach(t => {
      html += '<div class="team' + (t.dim?' dim':'') + '"><span>' + (t.flag?t.flag+' ':'') + esc(t.name) +
        '</span><span class="score">' + esc(t.score||'') + '</span></div>';
    });
    if ((d.meta||[]).length) {
      html += '<div class="meta">';
      d.meta.forEach(r => { html += '<div><span class="lbl">' + esc(r.label) + '</span><span class="val' +
        (r.highlight?' hi':'') + '">' + esc(r.value) + '</span></div>'; });
      html += '</div>';
    }
    if ((d.balls||[]).length) {
      html += '<div class="balls"><span class="lbl">This over</span>';
      d.balls.forEach(b => { html += '<span class="ball ' + (b.kind||'') + '">' + esc(b.text) + '</span>'; });
      html += '</div>';
    }
    html += '</div>';
    if (d.countdownTo) {
      html += '<div class="meta" style="margin-top:6px"><div><span class="lbl">Starts in</span>' +
        '<span class="val hi">' + cdSpan(d.countdownTo) + '</span></div></div>';
    }
    if ((d.others||[]).length) {
      html += '<div class="sectitle">' + esc(d.othersTitle || 'Also happening') + '</div>';
      d.others.forEach(o => { html += '<div class="mini"><span>' + esc(o.left) + '</span><span>' +
        esc(o.right) + '</span></div>'; });
    }
    return html;
  }

  // ---- F1: Schedule | Track Map ----
  let f1View = 'schedule';
  let mapData = null;
  let mapStatus = 'idle'; // idle | loading | ready | error
  let mapError = '';
  let anim = null;
  let frameIdx = 0;

  function renderF1(m) {
    const body = document.getElementById('body');
    let html = '<div class="subtoggle">' +
      '<button id="f1-sched" class="' + (f1View==='schedule'?'active':'') + '">📅 Schedule</button>' +
      '<button id="f1-map" class="' + (f1View==='map'?'active':'') + '">🗺️ Map</button>' +
      '<button id="f1-rc" class="' + (f1View==='rc'?'active':'') + '">🚩 Control</button>' +
      '<button id="f1-races" class="' + (f1View==='races'?'active':'') + '">🏁 Races</button>' +
      '</div>';
    if (f1View === 'schedule') { html += buildDetail(m.detail) + '<div id="standingsbody"></div>'; }
    else if (f1View === 'map') { html += '<div id="mapcontainer"></div>'; }
    else if (f1View === 'rc') { html += '<div id="rcbody"></div>'; }
    else { html += '<div id="racesbody"></div>'; }
    body.innerHTML = html;
    document.getElementById('f1-sched').onclick = () => { f1View='schedule'; stopAnim(); stopMapTimer(); stopRcTimer(); render(); };
    document.getElementById('f1-map').onclick = () => { f1View='map'; stopRcTimer(); render(); };
    document.getElementById('f1-rc').onclick = () => { f1View='rc'; stopAnim(); stopMapTimer(); render(); };
    document.getElementById('f1-races').onclick = () => { f1View='races'; stopAnim(); stopMapTimer(); stopRcTimer(); render(); };
    if (f1View === 'map') { renderMap(); }
    else if (f1View === 'races') { stopAnim(); renderRaces(); }
    else if (f1View === 'rc') { stopAnim(); renderRaceControl(); }
    else { stopAnim(); ensureStandings(); }
  }

  // ---- F1 Race Control feed (flags / SC / DRS / penalties) ----
  let rcData = null, rcStatus = 'idle', rcError = '', rcTimer = null;
  function stopRcTimer() { if (rcTimer) { clearInterval(rcTimer); rcTimer = null; } }
  function startRcTimer() {
    stopRcTimer();
    rcTimer = setInterval(() => {
      if (!document.hidden && f1View === 'rc') { vscode.postMessage({ type: 'requestF1RaceControl' }); }
    }, 30000);
  }

  function flagColor(flag, category) {
    const f = (flag || '').toUpperCase();
    if (f.includes('GREEN')) return '#16a34a';
    if (f.includes('DOUBLE YELLOW')) return '#d97706';
    if (f.includes('YELLOW')) return '#eab308';
    if (f.includes('RED')) return '#dc2626';
    if (f.includes('BLUE')) return '#2563eb';
    if (f.includes('CHEQUERED')) return '#111827';
    if (f.includes('BLACK AND WHITE')) return '#a16207';
    if (f.includes('CLEAR')) return '#6b7280';
    if ((category||'') === 'SafetyCar') return '#f59e0b';
    if ((category||'') === 'Drs') return '#0ea5e9';
    return '#6b7280';
  }

  function renderRaceControl() {
    const c = document.getElementById('rcbody');
    if (!c) return;
    if (rcStatus === 'idle') { rcStatus='loading'; vscode.postMessage({ type:'requestF1RaceControl' }); startRcTimer(); }
    if (rcStatus === 'loading' && !rcData) { c.innerHTML = '<div class="empty">Loading race control…</div>'; return; }
    if (rcStatus === 'error') { c.innerHTML = '<div class="empty">⚠ ' + esc(rcError) + '</div>'; return; }
    if (!rcData || !rcData.length) { c.innerHTML = '<div class="empty">No race control messages</div>'; return; }
    let html = '<div class="maptitle">Race control · latest first</div>';
    rcData.forEach((r) => {
      const col = flagColor(r.flag, r.category);
      const tag = r.flag ? r.flag : r.category;
      const lap = r.lap ? ('L' + r.lap) : '';
      html += '<div class="rcrow">' +
        '<span class="rcflag" style="background:' + col + '"></span>' +
        '<span class="rclap">' + esc(lap) + '</span>' +
        '<span class="rcmsg">' + esc(r.message) + '</span></div>';
    });
    c.innerHTML = html;
  }

  // ---- F1 championship standings (in the Schedule tab) ----
  let standings = null, standingsStatus = 'idle', standingsError = '', standingsView = 'drivers';

  function ensureStandings() {
    const c = document.getElementById('standingsbody');
    if (!c) return;
    if (standingsStatus === 'idle') { standingsStatus='loading'; vscode.postMessage({ type:'requestF1Standings' }); }
    if (standingsStatus === 'loading') {
      c.innerHTML = '<div class="sectitle" style="margin-top:14px">Championship standings</div><div class="empty">Loading…</div>';
      return;
    }
    if (standingsStatus === 'error') { c.innerHTML = '<div class="empty">⚠ ' + esc(standingsError) + '</div>'; return; }
    if (!standings) { c.innerHTML = ''; return; }
    c.innerHTML = buildStandings(standings);
    const db = document.getElementById('st-drv'), cb = document.getElementById('st-con');
    if (db) db.onclick = () => { standingsView='drivers'; ensureStandings(); };
    if (cb) cb.onclick = () => { standingsView='constructors'; ensureStandings(); };
  }

  function buildStandings(d) {
    const isDrv = standingsView === 'drivers';
    let html = '<div class="sectitle" style="margin-top:14px">Championship ' + esc(d.season) + '</div>';
    html += '<div class="subtoggle">' +
      '<button id="st-drv" class="' + (isDrv?'active':'') + '">Drivers</button>' +
      '<button id="st-con" class="' + (!isDrv?'active':'') + '">Constructors</button></div>';
    const rows = isDrv ? d.drivers : d.constructors;
    if (!rows || !rows.length) { return html + '<div class="empty">Standings not available yet</div>'; }
    html += '<table class="results"><tr><th class="p">P</th><th>' + (isDrv?'Driver':'Team') + '</th>' +
      (isDrv ? '<th>Team</th>' : '') + '<th class="rt">Pts</th><th class="rt">Wins</th></tr>';
    rows.forEach((r) => {
      html += '<tr><td class="p">' + esc(r.pos) + '</td><td>' + esc(r.name) + '</td>' +
        (isDrv ? ('<td>' + esc(r.team||'') + '</td>') : '') +
        '<td class="rt">' + esc(r.points) + '</td><td class="rt">' + esc(r.wins) + '</td></tr>';
    });
    html += '</table>';
    return html;
  }

  // ---- F1 race browser (pick an old race → see its result) ----
  let f1Races = null, racesStatus = 'idle', racesError = '';
  let raceResult = null, rrStatus = 'idle', rrError = '', rrSelected = null;

  function renderRaces() {
    const c = document.getElementById('racesbody');
    if (!c) return;
    if (rrSelected) {
      c.innerHTML = '<span class="backbtn" id="rr-back">← All races</span><div id="rrbody"></div>';
      document.getElementById('rr-back').onclick = () => { rrSelected=null; raceResult=null; rrStatus='idle'; render(); };
      const rb = document.getElementById('rrbody');
      if (rrStatus === 'idle') { rrStatus='loading'; vscode.postMessage({ type:'requestF1RaceResult', season:rrSelected.season, round:rrSelected.round }); }
      if (rrStatus === 'loading') { rb.innerHTML = '<div class="empty">Loading result…</div>'; return; }
      if (rrStatus === 'error') { rb.innerHTML = '<div class="empty">⚠ ' + esc(rrError) + '</div>'; return; }
      if (!raceResult) { rb.innerHTML = '<div class="empty">No result</div>'; return; }
      rb.innerHTML = buildRaceResult(raceResult);
      return;
    }
    if (racesStatus === 'idle') { racesStatus='loading'; vscode.postMessage({ type:'requestF1Races' }); }
    if (racesStatus === 'loading') { c.innerHTML = '<div class="empty">Loading races…</div>'; return; }
    if (racesStatus === 'error') { c.innerHTML = '<div class="empty">⚠ ' + esc(racesError) + '</div>'; return; }
    if (!f1Races || !f1Races.length) { c.innerHTML = '<div class="empty">No races</div>'; return; }
    let html = '<div class="maptitle">Select a race to see its result</div>';
    f1Races.forEach((r, i) => {
      html += '<div class="listrow" data-i="' + i + '"><span class="mt">' + esc(r.name) +
        '</span><span class="st">' + esc(r.dateLabel) + '</span></div>';
    });
    c.innerHTML = html;
    c.querySelectorAll('.listrow').forEach((el) => {
      el.onclick = () => { rrSelected = f1Races[+el.getAttribute('data-i')]; rrStatus='idle'; render(); };
    });
  }

  function buildRaceResult(d) {
    let html = '<div class="sc-inning">' + esc(d.name) + '</div><div class="venue">📅 ' + esc(d.dateLabel) + '</div>';
    html += '<table class="results"><tr><th class="p">P</th><th>Driver</th><th>Team</th><th class="rt">Result</th></tr>';
    d.rows.forEach((r) => {
      html += '<tr><td class="p">' + esc(r.pos) + '</td><td>' + esc(r.driver) + '</td><td>' +
        esc(r.team) + '</td><td class="rt">' + esc(r.result) + '</td></tr>';
    });
    html += '</table>';
    return html;
  }

  function renderMap() {
    const c = document.getElementById('mapcontainer');
    if (!c) return;
    if (mapStatus === 'idle') { mapStatus = 'loading'; vscode.postMessage({ type: 'requestF1Map' }); }
    if (mapStatus === 'loading') { c.innerHTML = '<div class="empty">Loading track map…</div>'; return; }
    if (mapStatus === 'error') { c.innerHTML = '<div class="empty">⚠ ' + esc(mapError) + '</div>'; return; }
    if (!mapData || !mapData.frames.length) { c.innerHTML = '<div class="empty">No position data</div>'; return; }
    c.innerHTML =
      '<div class="maptitle">' + esc(mapData.sessionName) + ' · ' + esc(mapData.circuit) +
        (mapData.live ? '<span class="replaybadge livebadge">LIVE</span>'
                      : '<span class="replaybadge">REPLAY</span>') + '</div>' +
      '<div class="mapwrap"><canvas id="track" width="280" height="240"></canvas>' +
      '<div class="grid" id="grid"></div></div>';
    renderLeaderboard();
    startAnim();
    if (mapData.live) { startMapTimer(); } else { stopMapTimer(); }
  }

  function tyreColor(t) {
    switch ((t||'').toUpperCase()) {
      case 'SOFT': return '#e0383b';
      case 'MEDIUM': return '#e6c84f';
      case 'HARD': return '#e8e8e8';
      case 'INTERMEDIATE': return '#43b02a';
      case 'WET': return '#1e6fff';
      default: return '#888';
    }
  }

  function renderLeaderboard() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const lb = (mapData && mapData.leaderboard) || [];
    if (!lb.length) { grid.innerHTML = '<div class="maptitle">Leaderboard unavailable</div>'; return; }
    let g = '<div class="maptitle">Running order</div>';
    lb.forEach(r => {
      const tyre = r.tyre
        ? '<span class="tyre" title="' + esc(r.tyre) + (r.tyreAge!=null?(' · '+r.tyreAge+' laps'):'') +
          '" style="background:' + tyreColor(r.tyre) + '">' + esc(r.tyre.charAt(0)) + '</span>'
        : '';
      g += '<div class="pos"><span class="pnum">' + r.pos + '</span>' +
        '<span class="swatch" style="background:' + r.color + '"></span>' +
        '<span class="acr">' + esc(r.acronym) + '</span>' +
        tyre +
        '<span class="gap">' + esc(r.gap) + '</span></div>';
    });
    grid.innerHTML = g;
  }

  function startAnim() {
    stopAnim();
    frameIdx = 0;
    const canvas = document.getElementById('track');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, pad = 16;
    const b = mapData.bounds;
    const spanX = (b.maxX - b.minX) || 1, spanY = (b.maxY - b.minY) || 1;
    const scale = Math.min((W - pad*2)/spanX, (H - pad*2)/spanY);
    const offX = (W - spanX*scale)/2, offY = (H - spanY*scale)/2;
    const sx = x => offX + (x - b.minX)*scale;
    const sy = y => H - (offY + (y - b.minY)*scale);
    const colorOf = {}, acrOf = {};
    mapData.cars.forEach(car => { colorOf[car.num]=car.color; acrOf[car.num]=car.acronym; });

    function draw() {
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle = 'rgba(140,140,140,0.30)';
      mapData.outline.forEach(p => { ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), 1.1, 0, 6.283); ctx.fill(); });
      const frame = mapData.frames[frameIdx];
      (frame ? frame.cars : []).forEach(car => {
        const px = sx(car.x), py = sy(car.y);
        ctx.beginPath(); ctx.fillStyle = colorOf[car.num] || '#fff';
        ctx.arc(px, py, 4, 0, 6.283); ctx.fill();
      });
      frameIdx = (frameIdx + 1) % mapData.frames.length;
    }
    draw();
    anim = setInterval(draw, 120);
  }

  function stopAnim() { if (anim) { clearInterval(anim); anim = null; } }

  // ---- Cricket: basic card + lazy full scorecard ----
  let cricketData = null;
  let cricketStatus = 'idle'; // idle | loading | ready | error
  let cricketError = '';

  function renderCricket(m) {
    const body = document.getElementById('body');
    body.innerHTML = buildDetail(m.detail) +
      '<div class="sectitle" style="margin-top:14px">Full scorecard ' +
      '<span class="refreshbtn" id="cric-refresh">↻ Refresh</span></div>' +
      '<div id="cricketcard"></div>';
    const rb = document.getElementById('cric-refresh');
    if (rb) rb.onclick = () => { cricketStatus = 'idle'; ensureCricket(); };
    ensureCricket();
    startCricketTimer();
  }

  function ensureCricket() {
    const c = document.getElementById('cricketcard');
    if (!c) return;
    if (cricketStatus === 'idle') { cricketStatus = 'loading'; vscode.postMessage({ type: 'requestCricket' }); }
    if (cricketStatus === 'loading') { c.innerHTML = '<div class="empty">Loading scorecard…</div>'; return; }
    if (cricketStatus === 'error') { c.innerHTML = '<div class="empty">⚠ ' + esc(cricketError) + '</div>'; return; }
    if (!cricketData) { c.innerHTML = '<div class="empty">No scorecard</div>'; return; }
    c.innerHTML = buildScorecard(cricketData);
  }

  function buildScorecard(d) {
    let html = '';
    if (d.toss) html += '<div class="toss">🪙 ' + esc(d.toss) + '</div>';
    if (d.venue) html += '<div class="venue">📍 ' + esc(d.venue) + '</div>';
    (d.innings || []).forEach(inn => {
      html += '<div class="sc-inning">' + esc(inn.title) + '</div>';
      if ((inn.batting||[]).length) {
        html += '<table class="sc"><tr><th class="name">Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr>';
        inn.batting.forEach(b => {
          html += '<tr><td class="name">' + esc(b.name) +
            (b.notOut ? ' <span class="notout">*</span>' : '') +
            '<span class="out">' + esc(b.out) + '</span></td>' +
            '<td>' + b.runs + '</td><td>' + b.balls + '</td><td>' + b.fours + '</td><td>' + b.sixes + '</td><td>' + b.sr + '</td></tr>';
        });
        html += '</table>';
      }
      if ((inn.bowling||[]).length) {
        html += '<table class="sc"><tr><th class="name">Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr>';
        inn.bowling.forEach(bw => {
          html += '<tr><td class="name">' + esc(bw.name) + '</td>' +
            '<td>' + bw.overs + '</td><td>' + bw.maidens + '</td><td>' + bw.runs + '</td><td>' + bw.wickets + '</td><td>' + bw.econ + '</td></tr>';
        });
        html += '</table>';
      }
    });
    return html || '<div class="empty">Scorecard not available yet</div>';
  }

  function badge(state){
    const dot = state==='live' ? '<span class="dot"></span>' : '';
    return '<span class="badge ' + state + '">' + dot + state + '</span>';
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ---- Live ticking countdowns ----
  function fmtCd(ms){
    if (ms <= 0) return 'now';
    const d = Math.floor(ms/86400000), h = Math.floor(ms%86400000/3600000),
          m = Math.floor(ms%3600000/60000), s = Math.floor(ms%60000/1000);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }
  function cdSpan(target){ return '<span class="cd" data-to="' + target + '">' + fmtCd(target - Date.now()) + '</span>'; }
  function fmtClock(sec){ const m = Math.floor(sec/60), s = Math.floor(sec%60); return m + ':' + String(s).padStart(2,'0'); }
  // Live match clock: anchored to the server's elapsed seconds, ticks client-side.
  function ltSpan(baseSec){ return '<span class="lt" data-base="' + baseSec + '" data-at="' + Date.now() + '">' + fmtClock(baseSec) + '</span>'; }
  let lastCdRefresh = 0;
  function tickCountdowns(){
    let anyZero = false;
    document.querySelectorAll('.cd[data-to]').forEach((el) => {
      const ms = (+el.getAttribute('data-to')) - Date.now();
      el.textContent = fmtCd(ms);
      if (ms <= 0) anyZero = true;
    });
    document.querySelectorAll('.lt[data-base]').forEach((el) => {
      const base = +el.getAttribute('data-base'), at = +el.getAttribute('data-at');
      el.textContent = fmtClock(base + (Date.now() - at) / 1000);
    });
    if (anyZero && Date.now() - lastCdRefresh > 60000) {
      lastCdRefresh = Date.now();
      vscode.postMessage({ type: 'refresh' });
    }
  }
  setInterval(tickCountdowns, 1000);

  // ---- Goal celebration ----
  function celebrate(text){
    const b = document.createElement('div');
    b.className = 'goalbanner'; b.textContent = text;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 1900);
    const colors = ['#e0383b','#ffd24a','#4ec9b0','#2980b9','#27ae60','#ffffff','#f59e0b'];
    for (let i = 0; i < 44; i++) {
      const c = document.createElement('div');
      c.className = 'confetti-piece';
      c.style.left = (Math.random() * 100) + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * 0.5) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2500);
    }
  }
  let lastGoals = {};
  function checkGoals(ms){
    const fb = (ms || []).find((x) => x.sport === 'football');
    if (!fb || fb.state !== 'live') return;
    const t = fb.detail.teams || [];
    const total = (parseInt(t[0] && t[0].score) || 0) + (parseInt(t[1] && t[1].score) || 0);
    const key = fb.detail.title || 'fb';
    if (lastGoals[key] !== undefined && total > lastGoals[key] && !document.hidden) {
      celebrate('⚽ GOAL!');
    }
    lastGoals[key] = total;
  }

  window.addEventListener('message', e => {
    const msg = e.data || {};
    if (msg.type === 'update') {
      matches = msg.matches || [];
      if (active >= matches.length) active = 0;
      checkGoals(matches);
      render();
      // Keep an open match page's lineups/timeline fresh on each poll (live only).
      if (matches[active] && matches[active].sport === 'football' && (fbView === 'featured' || fbSelected)) {
        const ev = fbSelected
          ? { id: fbSelected.eventId, lg: fbSelected.leagueCode, live: fbSelected.state === 'in' }
          : { id: matches[active].detail.eventId, lg: matches[active].detail.leagueCode, live: matches[active].state === 'in' };
        if (ev.live && ev.id) {
          vscode.postMessage({ type: 'requestFootballMatchDetail', leagueCode: ev.lg, eventId: ev.id });
        }
      }
    } else if (msg.type === 'f1Map') {
      mapData = msg.data; mapStatus = 'ready';
      if (f1View === 'map') renderMap();
    } else if (msg.type === 'f1MapError') {
      mapError = msg.message; mapStatus = 'error';
      if (f1View === 'map') renderMap();
    } else if (msg.type === 'cricket') {
      cricketData = msg.data; cricketStatus = 'ready';
      if (matches[active] && matches[active].sport === 'cricket') ensureCricket();
    } else if (msg.type === 'cricketError') {
      cricketError = msg.message; cricketStatus = 'error';
      if (matches[active] && matches[active].sport === 'cricket') ensureCricket();
    } else if (msg.type === 'footballMatches') {
      fbMatches = msg.data; fbStatus = 'ready';
      if (matches[active] && matches[active].sport === 'football') render();
    } else if (msg.type === 'footballMatchesError') {
      fbError = msg.message; fbStatus = 'error';
      if (matches[active] && matches[active].sport === 'football') render();
    } else if (msg.type === 'footballStandings') {
      fbStandings = msg.data; fbStStatus = 'ready';
      if (matches[active] && matches[active].sport === 'football' && fbView === 'standings') render();
    } else if (msg.type === 'footballStandingsError') {
      fbStError = msg.message; fbStStatus = 'error';
      if (matches[active] && matches[active].sport === 'football' && fbView === 'standings') render();
    } else if (msg.type === 'footballBracket') {
      fbBracket = msg.data; fbBrStatus = 'ready';
      if (matches[active] && matches[active].sport === 'football' && fbView === 'bracket') render();
    } else if (msg.type === 'footballBracketError') {
      fbBrError = msg.message; fbBrStatus = 'error';
      if (matches[active] && matches[active].sport === 'football' && fbView === 'bracket') render();
    } else if (msg.type === 'footballMatchDetail') {
      if (msg.data && msg.data.eventId) { fbMdCache[msg.data.eventId] = msg.data; }
      fbMdStatus = 'ready';
      if (matches[active] && matches[active].sport === 'football' && (fbView === 'featured' || fbSelected)) render();
    } else if (msg.type === 'footballMatchDetailError') {
      fbMdStatus = 'error';
    } else if (msg.type === 'f1Races') {
      f1Races = msg.data; racesStatus = 'ready';
      if (f1View === 'races') renderRaces();
    } else if (msg.type === 'f1RacesError') {
      racesError = msg.message; racesStatus = 'error';
      if (f1View === 'races') renderRaces();
    } else if (msg.type === 'f1RaceResult') {
      raceResult = msg.data; rrStatus = 'ready';
      if (f1View === 'races') renderRaces();
    } else if (msg.type === 'f1RaceResultError') {
      rrError = msg.message; rrStatus = 'error';
      if (f1View === 'races') renderRaces();
    } else if (msg.type === 'f1Standings') {
      standings = msg.data; standingsStatus = 'ready';
      if (f1View === 'schedule') ensureStandings();
    } else if (msg.type === 'f1StandingsError') {
      standingsError = msg.message; standingsStatus = 'error';
      if (f1View === 'schedule') ensureStandings();
    } else if (msg.type === 'f1RaceControl') {
      rcData = msg.data; rcStatus = 'ready';
      if (f1View === 'rc') renderRaceControl();
    } else if (msg.type === 'f1RaceControlError') {
      rcError = msg.message; rcStatus = 'error';
      if (f1View === 'rc') renderRaceControl();
    }
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }

  private dispose(): void {
    DetailPanel.current = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
