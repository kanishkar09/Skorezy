# 🏆 Skorezy — Live Sports Scores in VS Code

Live **football**, **F1**, and **cricket** scores right in your status bar — with an animated **F1 track map**, **championship standings**, **live timing**, and a **match browser**. Click any score to open a rich detail panel without leaving your editor.

**Football and F1 work instantly — no API key, no signup.**

## Features

- **Status bar scores** — one compact live item per sport, auto-updating
- **⚽ Football** — live scores across major leagues + World Cup, plus an **All Matches** browser (ESPN, keyless)
- **🏎️ F1** — next-race countdown, **driver & constructor standings**, an **animated track map** with live leaderboard (gaps + tyres), and a **past-race results browser** (OpenF1 + Jolpica, keyless)
- **🏏 Cricket** — full live scorecard: batting, bowling, toss, venue (free CricketData.org key)
- **Smart polling** — refreshes fast while live, backs off when idle; rate-limit caching + daily quota guards
- **Local timezone** — all times shown in your timezone (IST, GMT, etc.)
- **Theme-aware** — the panel matches your VS Code theme

## Sports & Data Sources

| Sport | Source | API key |
|---|---|---|
| Football | [ESPN](https://www.espn.com) public scoreboards | None |
| F1 | [OpenF1](https://openf1.org) + [Jolpica](https://github.com/jolpica/jolpica-f1) | None |
| Cricket | [CricketData.org](https://cricketdata.org) | Free key (optional) |

## Settings

| Setting | Default | Description |
|---|---|---|
| `skorezy.enabledSports` | `["football","f1"]` | Which sports to show (add `cricket` with a key) |
| `skorezy.refreshIntervalSeconds` | `45` | Refresh rate while live |
| `skorezy.idleRefreshMinutes` | `30` | Refresh rate when idle |
| `skorezy.football.favoriteTeams` | `[]` | Teams shown first when live (e.g. `Arsenal`) |
| `skorezy.cricket.apiKey` | `""` | Free CricketData.org key to enable cricket |
| `skorezy.cricket.favoriteTeams` | `[]` | e.g. `India` |

## Development

```bash
npm install
npm run compile      # or: npm run watch
# Press F5 in VS Code to launch the Extension Development Host
```

## Architecture

```
extension.ts → ScoreManager → [FootballProvider, F1Provider, CricketProvider]
                    │
                    ├── StatusBar   (one item per sport)
                    └── DetailPanel (webview: tabs, track map, browsers, standings)
```

Every provider implements the same `ScoreProvider` interface, so the manager and UI contain no sport-specific code.

## License

MIT © Kanishkar Kumar
