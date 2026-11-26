# launchlens

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jawaadalah/launchlens/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jawaadalah/launchlens/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — every pre-token protocol in the sealed DefiLlama snapshot, ranked by what its token would be worth, with a farm plan for each one. The radar-2 model prices a launch from the snapshot's own figures: TVL × the category's market multiple (median mcap/TVL of live-token protocols in the same category) × 7-day growth × age-without-a-token × chain reach. Wrapped, staked and bridged products of tokens that already trade are set aside with the live-token view — they are not launches waiting to happen. The board covers all 40 watchlist protocols plus every rankable pre-token protocol below the floor (198 rows), and the dashboard recomputes each row's implied value in the page and checks it against the board.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Then open `out/dashboard/index.html` (served over HTTP so it can load `out/data.js` beside it). Node 22 or later, standard library only. The program writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`; two runs write identical bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9h3tmt5h&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
