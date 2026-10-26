@AGENTS.md

# FantasyLab: project handoff

Durable facts for any new session. The code is the source of truth; `DECISIONS.md` holds the
why (one row per decision, superseded ones struck through). Don't duplicate it here; link to it.

## Start here (handoff protocol)

1. Read this file, `AGENTS.md`, then the relevant sections of `DECISIONS.md`.
2. `git status`, `git log --oneline -15`, `git worktree list`. Work happens on branch
   `claude/epic-lamport-wvbbwz`; Vercel deploys it to https://fantasy-football-xi-ecru.vercel.app.
   Commit and push only that branch; don't open PRs unless asked.
3. Read the code you'll touch before changing it. Look before you build (fetch ESPN, save a
   sample under `samples/`, build against it).
4. After substantial work, update this file (state, unfinished list) and `DECISIONS.md`, so the
   next session doesn't depend on an old conversation.
5. Explain results to the owner in plain language and say exactly where to tap to see them.

## What it is

FantasyLab is a mobile-first fantasy football web app/PWA for an owner with no coding
experience. It turns live NFL data into decisions: what your team scored play by play, who to
start, how good your roster is, and what to fix. Built on real ESPN data only (never fabricated
numbers). Not affiliated with ESPN or the NFL.

## Stack

Next.js 16.4.2 (App Router, `cacheComponents`, `"use cache: remote"` + custom `cacheLife`
profiles in `next.config.ts`), React 19.3 (React compiler lint rules), TypeScript, Tailwind 4
(`@theme` tokens in `app/globals.css`), GSAP 3.15 + `@gsap/react` (Flip, ScrollTrigger),
Supabase (`@supabase/ssr`, Postgres + Auth + Realtime), Anthropic SDK (optional Start/Sit
wording), zod, Vitest 5, Node ≥ 22. Hosting: Vercel (app), Railway (worker, optional).
`motion` (motion/react) is still a dependency and is being removed (see Unfinished).

## Map

- `app/`: screens and route handlers. Tabs: Home `/`, Team (`/team`, `/team/rating`*,
  `/start-sit`, `/team/edit`, `/team/import`), Players (`/players`, `/players/pickups`*,
  `/players/watchlist`, `/players/[id]`*), Trades (`/trades`*, `/trades/calculator`*), Live
  (`/feed`, `/games`, `/games/[id]`, `/chat`), plus `/settings`, `/account`, `/auth/*`,
  `/offline`. *= still the `ComingSoon` placeholder. API: `/api/scoreboard`, `/api/live`,
  `/api/games/[id]`, `/api/player/[id]` (+ `/profile`), `/api/players`, `/api/teams`,
  `/api/universe`, `/api/startsit`. Navigation lives in `lib/config.ts` (`NAV`).
- `components/`: `ui/` primitives (Button, Card, Pill, Stat, Sheet, Segmented, States,
  Icon), `shell/` (TopBar, Sidebar, BottomBar, SectionTabs, GlobalSearch, BackButton),
  `motion/` (PageEnter, AnimatedNumber, useFlipList), `glass/LiquidGlass`, `pwa/`, and one
  folder per feature (home, team, startsit, players, player, feed, games, gamecenter, chat,
  auth, settings).
- `lib/`: `providers/` (the only code that talks to ESPN; `types.ts` is the interface),
  `data/sports.ts` (cached server reads), `scoring/` (formats, K/DST, reconciliation),
  `live/` (team scoring, play text, game view), `startsit/`, `analysis/` (team rating,
  weaknesses, trades, pickups, player impact: built and tested, no UI yet), `players/`
  (research profile + better search: no UI wiring yet), `roster/` (device store, team links),
  `settings/`, `storage/persisted.ts`, `supabase/`, `chat/`, `espn-link/secret-box.ts`
  (AES-256-GCM for ESPN cookies), `pwa/`, `motion/`, `glass/`, `vendor/liquid-glass/`.
- `supabase/`: one migration (`migrations/20261022000000_init.sql`: profiles, rosters,
  roster_players, espn_connections, live tables, chat) and RLS tests (`tests/`).
- `worker/`: Node live-data poller (ESPN → Supabase) for Railway, with replay mode; own README.
- `samples/`: real, trimmed ESPN responses that tests are built against.
- `scripts/`: `test-db.sh` (RLS tests on a throwaway local Postgres), `test-pwa.mjs`
  (end-to-end PWA checks on two production builds), `store-screenshots.mjs`.
- `docs/SETUP.md`: click-by-click setup for Vercel, Supabase, Railway.

## Built and working

- Manual roster (search, slots, rename), saved on the device; team links (`/team/import?t=`).
- Live lineup with play-by-play points, Feed ("Plays"), Games board, Game Center, replay mode
  for days without games. Standard/Half/PPR plus kickers and D/ST, reconciled to box scores.
- Home dashboard: this week's projection/points, lineup "To do" decisions, next kickoffs.
- Start/Sit for up to 3 players, including players not on your team (flagged as such).
- Player browser, global search (⌘K), watchlist, player sheet from live screens.
- Accounts (email code / magic link, optional Google), roster sync, chat (global, game and
  league rooms, reports, blocks, rate limits). These need Supabase env vars; without them the
  app shows "setup needed" and stays fully usable as a guest.
- Settings: league size, taken players, liquid glass, animations (Full / Reduced / Match
  device), install status, updates, saved-data explanations.
- Installable PWA, verified on production builds and live: manifest + screenshots, service
  worker, offline page, update prompt, iPhone launch images, install card/steps per browser,
  iPhone team carry-over (paste team link), pull-to-refresh and back arrow in the installed app.

## Rules not to undo

- **Device first:** the app works with no account; never show an empty team before saved data
  is read; persisted stores are versioned with migrations and back up unreadable data
  (`lib/storage/persisted.ts`, keys `fantasylab:*`, legacy `the-feed:*` still read).
- **ESPN only through `lib/providers/`**, cached via `lib/data/sports.ts`; ESPN APIs are
  unofficial, so manual rosters always remain the fallback. Never invent data or responses.
- **Secrets:** `.env.local` / hosting only; every name in `.env.example`. ESPN cookies:
  encrypted at rest, server only, never logged or sent to the browser, deletable by the user.
  RLS on every table; service keys only on the server/worker.
- **Design:** true-black flat (no borders, shadows, glows or gradients at rest), Inter with
  tabular figures, colour only on data, one white primary pill per screen, tokens in
  `app/globals.css` only, text fields ≥ 16px. Owner wants all animations: GSAP only; `PageEnter`
  animates every `.card`; respect `html[data-motion]`; pass `yPercent: 0` with `y` tweens.
- **PWA:** `public/sw.js` never stores `/api/`, `/auth/`, `/account`, RSC requests or anything
  with a login; game pages (`/games*`) are never saved (live scores in HTML). Bump `REVISION`
  when caching rules change. Updates wait for the user's tap. Only production registers it.
- **Analysis honesty:** ratings/trades/pickups come from `lib/analysis` with explained
  methods; "likely available" is an estimate; never fabricate player facts.

## Data and scoring assumptions

Scoring formats are standard / half / ppr (ESPN defaults incl. K and D/ST) in `lib/scoring`;
custom league scoring isn't wired yet (`rosters.scoring_json` exists for it). Projections are
ESPN's (week and rest of season); live estimates are labeled. Player universe = ESPN's ~650
most-rostered players (`/api/universe`); players outside it score 0 in analysis. Server cache
profiles: live 5 s, outlook 10 min (incl. the player list, which carries injury status),
reference 6 h. In this sandbox, server-side ESPN fetches need `NODE_USE_ENV_PROXY=1`.

## Validation (all must pass before committing)

`npm run lint` · `npm test` · `npx next typegen && npx tsc --noEmit` ·
`NODE_USE_ENV_PROXY=1 npm run build` · `bash scripts/test-db.sh` · for PWA/service-worker
changes also `node scripts/test-pwa.mjs` (needs playwright-core + Chromium; see its header).
Last full run (commit 7ee879b): lint clean, 581 tests, build OK, 115 DB checks, 48/48 PWA checks.
Sandbox: kill servers by process group, never `pkill` by pattern; a scratch worktree with
hard-linked `node_modules` (`cp -al`) is the safe place for builds while editing elsewhere.

## Current state (2026-10-26)

Branch `claude/epic-lamport-wvbbwz`, last feature commit 7ee879b (installable app), deployed.
Working tree clean apart from this handoff. Three helper attempts (ESPN league link, GSAP
migration + touchdown sound, push notifications) stopped at the start on a usage limit and
left no changes. A scheduled Sunday live-game verification fired late and wasn't done.

## Unfinished / known issues

- Placeholder screens: Team rating, Pickups, Trade ideas, Trade calculator, Player profile.
  The engine (`lib/analysis`, `useUniverse`) and profile API (`/api/player/[id]/profile`)
  are ready; Home "rating / weakest spot / top pickup / top trade" cards also not built.
- Phase 9 ESPN league link: only the DB tables and `lib/espn-link/secret-box.ts` exist. No
  league provider, routes or UI; no league sample in `samples/` yet (owner's league ID needed
  for the "done when" check).
- `motion/react` still used in 14 files (auth, chat, feed, gamecenter, games, ReplayControls,
  TouchdownBurst, MotionProvider in `app/layout.tsx`); plan: GSAP equivalents, drop `motion`.
- Phase 10 leftovers: touchdown sound toggle; push notifications (optional; needs VAPID keys,
  a subscriptions table, the worker running).
- `lib/players/search.ts` not yet used by GlobalSearch / PlayerSearch / PlayerBrowser.
- Live in-game parsing (possession, down & distance, red zone) not yet re-checked against a
  real live game; possible D/ST-stat bug for two-way players in
  `fantasyStatsToStatLine` (`lib/providers/espn/stats`) is unverified.
- DECISIONS.md lacks the analysis-engine and player-research decisions (only partially logged).
- Supabase/Railway setup on the owner's side is unconfirmed; chat and sync need it.
- Some legacy class names (`text-gain`, `glass-chip`, `text-ink-strong`) remain in auth/chat/feed.

## Suggested next work (recommendation, not confirmed requirements)

1. Build the five analysis screens + Home cards (biggest visible gap; engine is done).
2. Phase 9 ESPN league import (ask the owner for their league ID; sample before building).
3. Finish the GSAP migration and remove `motion`; touchdown sound toggle.
4. Verify live parsing during a real game; wire `lib/players/search.ts`; QA pass at 390 px.
5. Push notifications, only if the owner wants them and sets up keys + worker.
