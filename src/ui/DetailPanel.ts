import * as vscode from 'vscode';
import { Match } from '../core/types';

/** Singleton webview panel showing full detail for all sports, with tabs. */
export class DetailPanel {
  private static current: DetailPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private latest: Match[] = [];
  private disposables: vscode.Disposable[] = [];

  static show(matches: Match[]): void {
    if (DetailPanel.current) {
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
    DetailPanel.current = new DetailPanel(panel, matches);
  }

  /** Push fresh data to an already-open panel (called by the poller). */
  static update(matches: Match[]): void {
    DetailPanel.current?.setMatches(matches);
  }

  private constructor(panel: vscode.WebviewPanel, matches: Match[]) {
    this.panel = panel;
    this.latest = matches;
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    // Send data once the webview signals it is ready.
    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg?.type === 'ready') {
          this.post();
        }
      },
      null,
      this.disposables
    );
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
    const d = m.detail;
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
    body.innerHTML = html;
  }

  function badge(state){
    const dot = state==='live' ? '<span class="dot"></span>' : '';
    return '<span class="badge ' + state + '">' + dot + state + '</span>';
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  window.addEventListener('message', e => {
    if (e.data?.type === 'update') {
      matches = e.data.matches || [];
      if (active >= matches.length) active = 0;
      render();
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
