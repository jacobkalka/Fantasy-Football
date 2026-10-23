# The live-data worker

## What it is, in plain English

Right now each phone running The Feed asks our website for fresh scores every few seconds, and
the website asks ESPN. That works, but it doesn't scale well and everyone polls separately.

The **worker** is a small program that runs all the time on a server (Railway). It is the only
thing that talks to ESPN. It checks ESPN on a sensible schedule and writes what it learns into
the Supabase database: games, every play, how many fantasy points each play was worth to each
player, each player's official stat line, and injuries. Supabase then pushes those changes to
every open app instantly ("Realtime"), so phones don't have to keep asking.

The worker doesn't show anything itself. It has one tiny web page, `/health`, which tells you
(and Railway) whether it's working.

## When it checks ESPN

| Situation | What it does |
|-----------|--------------|
| Nothing happening | Checks the scoreboard every **5 minutes**. |
| A game kicks off within 30 minutes | Checks the scoreboard every **30 seconds**. |
| Any game is live | Scoreboard every **~8 seconds**, plus the full play-by-play every ~8 seconds for each live game that has a player someone has on their roster. If nobody has a roster yet, it follows every live game so the app still has data. Set `POLL_ALL_LIVE_GAMES=true` to always follow every live game. |
| A followed game ends | Fetches it one more time to save the final plays and official box score. (After a restart it does this once for the week's finished games, which also fills any gap.) |
| Every 10 minutes | Checks ESPN's fantasy injury status (Questionable, Out…) for players on anyone's roster. |
| Every 6 hours | Refreshes the list of teams and players. |

Safety rails: a hard cap on ESPN requests per minute (default 120), waits that grow after
errors (8 s, 16 s, 32 s… up to 5 minutes), and a little randomness in every wait.

## What it writes

| Table | What goes in |
|-------|--------------|
| `teams` | All 32 teams (name, colours, logo). |
| `games` | This week's games: state (`pre` / `in` / `post`), clock, quarter, score, who has the ball, down & distance, red zone, odds, weather, stadium. |
| `plays` | Every play, once (by ESPN's play id). If ESPN corrects a play, the row is updated. If ESPN removes a play, it stays but gets `deleted = true`. |
| `player_play_points` | For each play and each player in it: what changed (`stat_changes_json`) and the points in standard, half-PPR and PPR. |
| `player_game_stats` | Each player's official line for the game (plus two-point conversions, which ESPN's box score leaves out) and points in all three formats. |
| `injury_events` | In-game reports from the play text ("was injured", "has returned to the game"…, `source = 'espn-play'`) and fantasy status changes ("Questionable" → "Out", `source = 'espn-fantasy'`). Never stored twice. |
| `players` | Names, positions, teams, headshots, current injury status. |

Rows are only written when something actually changed, so a quiet tick writes nothing.

## Settings (environment variables)

| Name | Needed? | What it is |
|------|---------|------------|
| `DATABASE_URL` | **Yes** | Supabase's connection string (see below). Secret: never share it or commit it. |
| `PORT` | No | Port for `/health`. Railway sets it for you. Default 8080. |
| `POLL_ALL_LIVE_GAMES` | No | `true` = follow every live game, not just games with a rostered player. Default `false`. |
| `ESPN_MAX_REQUESTS_PER_MINUTE` | No | Hard cap on ESPN requests per minute. Default `120`. |
| `LIVE_POLL_SECONDS` | No | How often to poll during live games. Default `8` (minimum 5). |

## Run it on your computer

You need Node.js 22 or newer.

1. Make sure your Supabase database has the tables (see `supabase/README.md`, "Applying it").
2. Put your connection string in the project's `.env.local` file (the same file the web app
   uses; it is never committed):
   ```
   DATABASE_URL=postgresql://postgres.abcdefgh:YOUR-PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```
3. In a terminal, from the project folder:
   ```bash
   cd worker
   npm install      # first time only
   npm run once     # one check, then stops: a quick way to test your setup
   npm start        # runs until you press Ctrl+C
   ```
4. While it runs, open <http://localhost:8080/health> in your browser.

Every check prints one line, for example:

```
2026-10-23T00:31:02Z tick live games=14 live=1 pbp=1/1 plays=+3/~0/-0 points=4 stats=2 injuries=+0 games_changed=1 espn=3 (111/120 left) took=640ms next=8.3s
```

`plays=+3/~0/-0` means 3 new plays, 0 corrected, 0 removed. `espn=3 (111/120 left)` is how many
ESPN requests it made and how many are left this minute.

## Test it on a day without games: replay mode

Replay takes a finished game and plays it back into the database as if it were live, sped up.

```bash
cd worker
npm run replay -- 401872996              # 60× speed: a 3-hour game takes about 3 minutes
npm run replay -- 401872996 --speed 600  # 600×: about 20 seconds
npm run clean-replays                    # delete all replay data when you're done
```

(`401872996` is HOU @ JAX from week 6. Any finished game's ESPN id works: it's the number in
an ESPN game link, e.g. `espn.com/nfl/game/_/gameId/401872996`.)

**How replays are kept apart from real data:** everything a replay writes has `replay-` in
front of its id: the game is `replay-401872996`, and every play id starts with `replay-`. Points
and stats hang off those ids, and injury events get `game_id = 'replay-…'`. To show only real
games, the app filters out ids starting with `replay-` (e.g. `.not('id', 'like', 'replay-%')`).
Pressing Ctrl+C during a replay stops it and marks the game "Replay stopped".

## Put it online with Railway (click by click)

Do this once. The worker costs very little to run (it fits easily in Railway's Hobby plan).

1. Go to **railway.com** and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo** → pick this repository (if it isn't listed,
   click **Configure GitHub App** and give Railway access to it).
3. Railway creates a service and tries a first deploy. That first try may fail: it hasn't been
   told it's the worker yet. Click the new service (the box on the canvas), then **Settings**:
   - **Source → Root Directory:** leave it **empty**. (The worker uses shared code from `lib/`,
     so it needs the whole repository.)
   - **Build → Custom Build Command:** `npm ci --prefix worker`
   - **Deploy → Custom Start Command:** `node worker/start.mjs`
     (not `npm start`: started directly, the worker hears Railway's "please stop" signal and
     finishes its current step before exiting)
   - **Deploy → Healthcheck Path:** `/health`
   - **Deploy → Restart Policy:** On Failure (the default is fine).
   - **Build → Watch Paths** (optional, saves rebuilds): `/worker/**` and `/lib/**`, so changes
     to the website alone don't restart the worker.
   - Keep **1 replica**: one worker is enough and avoids double work.
4. Get the database connection string from Supabase:
   1. Open your project at **supabase.com/dashboard**.
   2. Click **Connect** (top of the page).
   3. Under **Connection String**, choose type **URI** and the **Session pooler** method. (Not
      "Direct connection": Railway can't reach that address.)
   4. Copy the string. It contains `[YOUR-PASSWORD]`: replace that with your database password.
      Forgot it? **Project Settings → Database → Reset database password.** If the password
      has symbols like `@`, `#` or `/`, pick one without them, or they break the string.
5. Back in Railway, open the service's **Variables** tab → **New Variable**:
   name `DATABASE_URL`, value: the string from step 4. Click **Add**. (Don't add `PORT`;
   Railway sets it.) Add any optional settings from the table above the same way.
6. Railway redeploys by itself. Open **Deployments** → the newest one → **View logs**. You
   should see, within a few seconds:
   ```
   database connected (PostgreSQL 17.x)
   worker starting: live poll 8s, ESPN cap 120/min, games with tracked players
   health check listening on port 8080 (/health)
   reference teams=32 (+32 ~0) players=1054 (+1054 ~0)
   tick idle games=14 live=0 …
   ```
7. Check the tables in Supabase: **Table Editor → games** now has this week's games, and
   **teams** has 32 rows. On game day, **plays** fills up as the game goes on.
8. (Optional) To open `/health` in your browser: **Settings → Networking → Generate Domain**,
   then visit `https://<that-domain>/health`. It shows when the worker last reached ESPN
   (`lastEspnFetchAt`), last wrote to the database (`lastWriteAt`) and which games it's following
   (`gamesTracked`).

When you push new code to GitHub, Railway redeploys the worker automatically. It stops the old
copy gracefully (it finishes the current check first).

**If something's wrong,** the logs say so in plain words: `DATABASE_URL is not set`, `play-by-play
failed for 401873010: …` (ESPN hiccup; it retries on its own), or `ERROR …` at the end of a tick
line.

## For developers

- Code: `src/main.ts` (commands) → `src/worker.ts` (the loop) → `src/schedule.ts` (when to poll,
  pure) and `src/rows.ts` (provider data → table rows, pure) → `src/store.ts` (all SQL). Replay is
  `src/replay.ts`, `/health` is `src/health.ts`.
- The worker only reaches ESPN through `lib/providers` (the same provider the website uses) and
  scores with `lib/scoring`, so the database and the app always agree.
- It runs TypeScript directly: `start.mjs` switches on `tsx` with `worker/tsconfig.json`, which
  maps `@/…` to the project root, then loads `src/main.ts`. No build step.
- The database driver is `postgres` (postgres.js), loaded with `require()` and typed by hand in
  `src/db.ts`, so the website's build (which type-checks every `.ts` file) never needs the
  worker's packages.
- Tests: from the project folder, `npx vitest run worker` (or `npm test` for everything).
  `test/worker.db.test.ts` starts a throwaway local PostgreSQL 16 with the real migration, the
  same way `scripts/test-db.sh` does; it is skipped if PostgreSQL isn't installed
  (`sudo apt install postgresql-16`, or `brew install postgresql@16`; set `PG_BIN` if it's
  somewhere unusual) or if `npm install` hasn't been run in `worker/`.
- Type check: `cd worker && npm run typecheck`.
