import * as vscode from 'vscode';
import { SportId } from './core/types';

export interface SportbarConfig {
  enabledSports: SportId[];
  refreshIntervalSeconds: number;
  idleRefreshMinutes: number;
  statusBarMaxLength: number;
  useMockData: boolean;
}

/** Read the current settings from VS Code configuration. */
export function getConfig(): SportbarConfig {
  const c = vscode.workspace.getConfiguration('sportbar');
  return {
    enabledSports: c.get<SportId[]>('enabledSports', ['cricket', 'football', 'f1']),
    refreshIntervalSeconds: c.get<number>('refreshIntervalSeconds', 45),
    idleRefreshMinutes: c.get<number>('idleRefreshMinutes', 30),
    statusBarMaxLength: c.get<number>('statusBarMaxLength', 30),
    useMockData: c.get<boolean>('useMockData', true),
  };
}
