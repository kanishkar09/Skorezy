import * as vscode from 'vscode';
import { Match, ScoreProvider } from './types';
import { StatusBar } from '../ui/StatusBar';
import { DetailPanel } from '../ui/DetailPanel';

interface PollingConfig {
  liveSeconds: number;
  idleMinutes: number;
}

/**
 * Orchestrates all providers: runs the polling loop, fans results out to the
 * status bar and the detail panel. Contains no sport-specific logic.
 */
export class ScoreManager implements vscode.Disposable {
  private latest: Match[] = [];
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;
  private prevState = new Map<string, string>(); // match key -> last seen state
  private firstRun = true;

  /** Called after every poll with the latest matches (used to refresh the tree). */
  onUpdate?: (matches: Match[]) => void;

  constructor(
    private readonly providers: ScoreProvider[],
    private readonly statusBar: StatusBar,
    private readonly polling: PollingConfig
  ) {}

  /** Kick off the first fetch and schedule subsequent ones. */
  start(): void {
    void this.tick();
  }

  /** Force an immediate refresh (used by the refresh command). */
  async refreshNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    await this.tick();
  }

  /** Current snapshot, used when the panel is first opened. */
  get matches(): Match[] {
    return this.latest;
  }

  private async tick(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const results = await Promise.allSettled(this.providers.map((p) => p.fetch()));
    this.latest = results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : this.fallback(this.providers[i], r.reason)
    );

    for (const m of this.latest) {
      this.statusBar.update(m);
    }
    DetailPanel.update(this.latest);
    this.onUpdate?.(this.latest);
    this.detectKickoffs();

    this.schedule();
  }

  /** Pop a notification when a match transitions from upcoming → live. */
  private detectKickoffs(): void {
    for (const m of this.latest) {
      const key = `${m.sport}:${m.detail?.eventId || m.detail?.title || m.sport}`;
      const prev = this.prevState.get(key);
      this.prevState.set(key, m.state);
      // Skip the very first poll so we don't announce already-live matches on startup.
      if (this.firstRun) {
        continue;
      }
      if (m.state === 'live' && prev && prev !== 'live') {
        const title = m.detail?.title || m.statusBarText;
        vscode.window
          .showInformationMessage(`${m.emoji} ${title} is now LIVE!`, 'Open Skorezy')
          .then((choice) => {
            if (choice) {
              void vscode.commands.executeCommand('skorezy.showPanel');
            }
          });
      }
    }
    this.firstRun = false;
  }

  private schedule(): void {
    const now = Date.now();
    const anyLive = this.latest.some((m) => m.state === 'live');
    let delayMs: number;
    if (anyLive) {
      delayMs = this.polling.liveSeconds * 1000;
    } else {
      // How soon is the next match? Poll fast as kickoff approaches so we catch
      // it going live promptly and keep the status-bar countdown fresh.
      const soon = this.latest
        .map((m) => m.detail?.countdownTo)
        .filter((t): t is number => typeof t === 'number' && t > now)
        .map((t) => t - now);
      const minSoon = soon.length ? Math.min(...soon) : Infinity;
      if (minSoon <= 15 * 60 * 1000) {
        delayMs = 60 * 1000; // within 15 min → every minute
      } else {
        delayMs = this.polling.idleMinutes * 60 * 1000;
      }
    }
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private fallback(provider: ScoreProvider, reason: unknown): Match {
    const msg = reason instanceof Error ? reason.message : String(reason);
    return {
      sport: provider.id,
      state: 'error',
      emoji: provider.emoji,
      statusBarText: `⚠ ${provider.id}`,
      tooltip: `${provider.id} failed: ${msg}`,
      detail: {
        sport: provider.id,
        state: 'error',
        title: 'Error',
        subtitle: msg,
        teams: [],
        meta: [],
      },
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
}
