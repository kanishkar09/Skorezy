# 🏆 SportBar — Live Sports Scores in VS Code

Live **cricket**, **football**, and **F1** scores right in your status bar. Click any score to open a detail panel with full scorecards, scorers, run rates, and upcoming fixtures — without leaving your editor.

![status bar](docs/statusbar.png)

## Features

- **Status bar scores** — one compact live item per sport, updates automatically
- **Detail panel** — click for full scorecard, this-over balls, scorers, race countdown
- **Smart polling** — refreshes fast (45s) only while a match is live, backs off when idle to respect free API limits
- **Theme-aware** — the panel matches your VS Code theme
- **Pluggable** — each sport is a self-contained provider; adding a new sport is one file

## Sports & Data Sources

| Sport | Source | API key |
|---|---|---|
| Cricket | [CricketData.org](https://cricketdata.org) | Free key |
| Football | [football-data.org](https://www.football-data.org) | Free key |
| F1 | [Jolpica](https://github.com/jolpica/jolpica-f1) (Ergast successor) | None |

> Ships with **mock data on by default** (`sportbar.useMockData: true`) so it works instantly. Turn it off and add API keys for live data.

## Settings

| Setting | Default | Description |
|---|---|---|
| `sportbar.enabledSports` | all three | Which sports to show |
| `sportbar.refreshIntervalSeconds` | `45` | Refresh rate while live |
| `sportbar.idleRefreshMinutes` | `30` | Refresh rate when idle |
| `sportbar.statusBarMaxLength` | `30` | Truncate status bar text |
| `sportbar.useMockData` | `true` | Use sample data instead of live APIs |

## Development

```bash
npm install
npm run compile      # or: npm run watch
# Press F5 in VS Code to launch the Extension Development Host
```

## Architecture

```
extension.ts → ScoreManager → [CricketProvider, FootballProvider, F1Provider]
                    │
                    ├── StatusBar   (one item per sport)
                    └── DetailPanel (webview, tabbed)
```

Every provider implements the same `ScoreProvider` interface, so the manager and UI contain zero sport-specific code.

## License

MIT
