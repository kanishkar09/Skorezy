# 🏆 Skorezy — Football, F1 & Cricket in VS Code

Follow **football** and **Formula 1** right from your VS Code status bar — with an animated **F1 track map**, **championship standings**, a **race-control feed**, **World Cup group tables**, and goal-by-goal match detail. Click any item to open a rich panel without leaving your editor.

> **Football and F1 work instantly — no API key, no signup.**

---

## ✨ Features

**Status bar** — one compact item per sport, auto-updating (fast while a match is on, relaxed when idle).

### ⚽ Football — *ESPN, keyless*
- Match results across the **World Cup**, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League & MLS
- **Featured** match with goal scorers, venue, competition, and a kickoff countdown
- **Matches** browser — every game across competitions, click any to view detail
- **Standings** — full World Cup group tables (played / GD / points)

### 🏎️ Formula 1 — *OpenF1 + Jolpica, keyless*
- **Weekend schedule** — FP1/2/3, Qualifying & Race, with live session detection
- **Driver & constructor standings**
- **Track Map** — animated car positions with a live timing leaderboard (gaps + tyre compounds)
- **Race Control** — flags, safety car, DRS and penalty feed
- **Races** browser — pick any past race for full results

### 🏏 Cricket — *🚧 in development*
- Live scorecard (batting, bowling, toss, venue) — **experimental**, requires a free CricketData.org key
- Off by default while it's being polished

### Everything else
- **Smart polling** — refreshes quickly during live events, backs off when idle; with caching + quota guards
- **Local timezone** — all times shown in your zone (IST, GMT, …)
- **Theme-aware** — the panel matches your VS Code theme

---

## 🔌 Data Sources

| Sport | Source | API key |
|---|---|---|
| Football | ESPN public scoreboards | None |
| F1 | OpenF1 + Jolpica (Ergast) | None |
| Cricket *(in development)* | CricketData.org | Free key (optional) |

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| `skorezy.enabledSports` | `["football","f1"]` | Which sports to show (add `cricket` once you set a key) |
| `skorezy.refreshIntervalSeconds` | `45` | Refresh rate while a match is on |
| `skorezy.idleRefreshMinutes` | `30` | Refresh rate when nothing is on |
| `skorezy.football.favoriteTeams` | `[]` | Teams shown first (e.g. `Arsenal`) |
| `skorezy.cricket.apiKey` | `""` | Free CricketData.org key (enables the in-development cricket view) |
| `skorezy.cricket.favoriteTeams` | `[]` | e.g. `India` |

---

## License

MIT © Kanishkar Kumar Krishnan
