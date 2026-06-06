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

    this.schedule();
  }

  private schedule(): void {
    const anyLive = this.latest.some((m) => m.state === 'live');
    const delayMs = anyLive
      ? this.polling.liveSeconds * 1000
      : this.polling.idleMinutes * 60 * 1000;
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
