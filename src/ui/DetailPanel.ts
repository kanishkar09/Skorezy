import * as vscode from 'vscode';
import { Match, TrackMapData, CricketScorecard } from '../core/types';

export interface PanelLoaders {
  f1Map?: () => Promise<TrackMapData>;
  cricket?: () => Promise<CricketScorecard>;
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
      'sportbar.live',
      'SportBar: Live',
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
        }
      },
      null,
      this.disposables
    );
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
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
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
  .badge.live { background:#c0392b; color:#fff; }
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
  .grid { font-size:11px; min-width:120px; }
  .grid .pos { display:flex; align-items:center; gap:6px; padding:3px 0; }
  .grid .swatch { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
  .maptitle { font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:8px; }
  .replaybadge { display:inline-block; font-size:9px; padding:1px 6px; border-radius:8px;
    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); margin-left:6px; }
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
    if (m.sport === 'f1') { renderF1(m); return; }
    stopAnim();
    if (m.sport === 'cricket') { renderCricket(m); return; }
    body.innerHTML = buildDetail(m.detail);
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
    if ((d.others||[]).length) {
      html += '<div class="sectitle">Also happening</div>';
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
      '<button id="f1-map" class="' + (f1View==='map'?'active':'') + '">🗺️ Track Map</button>' +
      '</div>';
    html += (f1View === 'schedule') ? buildDetail(m.detail) : '<div id="mapcontainer"></div>';
    body.innerHTML = html;
    document.getElementById('f1-sched').onclick = () => { f1View='schedule'; stopAnim(); render(); };
    document.getElementById('f1-map').onclick = () => { f1View='map'; render(); };
    if (f1View === 'map') { renderMap(); } else { stopAnim(); }
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
        (mapData.live ? '<span class="replaybadge" style="background:#c0392b;color:#fff">LIVE</span>'
                      : '<span class="replaybadge">REPLAY</span>') + '</div>' +
      '<div class="mapwrap"><canvas id="track" width="300" height="260"></canvas>' +
      '<div class="grid" id="grid"></div></div>';
    startAnim();
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
      const grid = document.getElementById('grid');
      if (grid) {
        let g = '<div class="maptitle">Frame ' + (frameIdx+1) + '/' + mapData.frames.length + '</div>';
        mapData.cars.forEach(car => {
          g += '<div class="pos"><span class="swatch" style="background:' + car.color + '"></span>' + esc(car.acronym) + '</div>';
        });
        grid.innerHTML = g;
      }
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

  window.addEventListener('message', e => {
    const msg = e.data || {};
    if (msg.type === 'update') {
      matches = msg.matches || [];
      if (active >= matches.length) active = 0;
      render();
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
