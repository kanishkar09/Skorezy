import * as vscode from 'vscode';
import { Match, SportId } from '../core/types';

/** Manages one status bar item per sport. */
export class StatusBar implements vscode.Disposable {
  private items = new Map<SportId, vscode.StatusBarItem>();

  constructor(sports: SportId[], private readonly maxLength: number) {
    // Higher priority shows further left. Keep a stable order.
    let priority = 100;
    for (const sport of sports) {
      const item = vscode.window.createStatusBarItem(
        `skorezy.${sport}`,
        vscode.StatusBarAlignment.Left,
        priority--
      );
      item.command = 'skorezy.showPanel';
      item.text = '$(sync~spin)';
      item.show();
      this.items.set(sport, item);
    }
  }

  update(match: Match): void {
    const item = this.items.get(match.sport);
    if (!item) {
      return;
    }
    item.text = `${match.emoji} ${this.truncate(match.statusBarText)}`;
    item.tooltip = match.tooltip;
    item.backgroundColor =
      match.state === 'error'
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;
  }

  private truncate(text: string): string {
    return text.length > this.maxLength ? text.slice(0, this.maxLength - 1) + '…' : text;
  }

  dispose(): void {
    this.items.forEach((i) => i.dispose());
    this.items.clear();
  }
}
