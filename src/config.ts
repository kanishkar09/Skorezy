import * as vscode from 'vscode';
import { SportId } from './core/types';

export interface SportbarConfig {
  enabledSports: SportId[];
  refreshIntervalSeconds: number;
  idleRefreshMinutes: number;
  statusBarMaxLength: number;
  useMockData: boolean;
  cricketApiKey: string;
  cricketFavoriteTeams: string[];
  footballLeagues: string[];
  footballFavoriteTeams: string[];
}

/** Read the current settings from VS Code configuration. */
export function getConfig(): SportbarConfig {
  const c = vscode.workspace.getConfiguration('skorezy');
  return {
    enabledSports: c.get<SportId[]>('enabledSports', ['football', 'f1']),
    refreshIntervalSeconds: c.get<number>('refreshIntervalSeconds', 45),
    idleRefreshMinutes: c.get<number>('idleRefreshMinutes', 30),
    statusBarMaxLength: c.get<number>('statusBarMaxLength', 30),
    useMockData: c.get<boolean>('useMockData', true),
    cricketApiKey: c.get<string>('cricket.apiKey', '').trim(),
    cricketFavoriteTeams: c.get<string[]>('cricket.favoriteTeams', []),
    footballLeagues: c.get<string[]>('football.leagues', []),
    footballFavoriteTeams: c.get<string[]>('football.favoriteTeams', []),
  };
}
