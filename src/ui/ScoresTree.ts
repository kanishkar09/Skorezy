import * as vscode from 'vscode';
import { Match } from '../core/types';

/** Activity-bar sidebar view: one row per sport, click to open the full panel. */
export class ScoresTree implements vscode.TreeDataProvider<ScoreNode> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private matches: Match[] = [];

  refresh(matches: Match[]): void {
    this.matches = matches;
    this.emitter.fire();
  }

  getTreeItem(node: ScoreNode): vscode.TreeItem {
    return node;
  }

  getChildren(): ScoreNode[] {
    if (!this.matches.length) {
      return [new ScoreNode('Loading scores…', '', 'idle')];
    }
    return this.matches.map(
      (m) => new ScoreNode(`${m.emoji} ${m.statusBarText}`, m.tooltip, m.state)
    );
  }
}

class ScoreNode extends vscode.TreeItem {
  constructor(label: string, tooltip: string, state: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.command = { command: 'skorezy.showPanel', title: 'Open Live Scores' };
    if (state === 'live') {
      this.description = '● live';
    } else if (state === 'upcoming') {
      this.description = 'upcoming';
    }
  }
}
