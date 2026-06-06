import * as vscode from 'vscode';
import { getConfig } from './config';
import { ScoreProvider } from './core/types';
import { ScoreManager } from './core/ScoreManager';
import { StatusBar } from './ui/StatusBar';
import { DetailPanel } from './ui/DetailPanel';
import { CricketProvider } from './providers/CricketProvider';
import { FootballProvider } from './providers/FootballProvider';
import { F1Provider } from './providers/F1Provider';

let manager: ScoreManager | undefined;
let statusBar: StatusBar | undefined;
let f1Provider: F1Provider | undefined;
let cricketProvider: CricketProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  bootstrap(context);

  // Rebuild when settings change.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('sportbar')) {
        teardown();
        bootstrap(context);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sportbar.showPanel', () => {
      DetailPanel.show(manager?.matches ?? [], {
        f1Map: f1Provider ? () => f1Provider!.getTrackMap() : undefined,
        cricket: cricketProvider ? () => cricketProvider!.getScorecard() : undefined,
      });
    }),
    vscode.commands.registerCommand('sportbar.refresh', () => manager?.refreshNow())
  );
}

function bootstrap(context: vscode.ExtensionContext): void {
  const cfg = getConfig();

  const allProviders: Record<string, () => ScoreProvider> = {
    cricket: () =>
      new CricketProvider(cfg.useMockData, cfg.cricketApiKey || undefined, cfg.cricketFavoriteTeams),
    football: () => new FootballProvider(cfg.useMockData, cfg.footballApiKey || undefined),
    f1: () => new F1Provider(cfg.useMockData),
  };

  const providers = cfg.enabledSports
    .filter((s) => s in allProviders)
    .map((s) => allProviders[s]());

  f1Provider = providers.find((p) => p.id === 'f1') as F1Provider | undefined;
  cricketProvider = providers.find((p) => p.id === 'cricket') as CricketProvider | undefined;

  statusBar = new StatusBar(
    providers.map((p) => p.id),
    cfg.statusBarMaxLength
  );

  manager = new ScoreManager(providers, statusBar, {
    liveSeconds: cfg.refreshIntervalSeconds,
    idleMinutes: cfg.idleRefreshMinutes,
  });

  context.subscriptions.push(statusBar, manager);
  manager.start();
}

function teardown(): void {
  manager?.dispose();
  statusBar?.dispose();
  manager = undefined;
  statusBar = undefined;
  f1Provider = undefined;
  cricketProvider = undefined;
}

export function deactivate(): void {
  teardown();
}
