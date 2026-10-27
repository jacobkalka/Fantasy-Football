@AGENTS.md

# FantasyLab: project handoff

Durable facts for any new session. The code is the source of truth; `DECISIONS.md` holds the
why (one row per decision, superseded ones struck through). Don't duplicate it here; link to it.

## Start here (handoff protocol)

1. Read this file, `AGENTS.md`, then the relevant sections of `DECISIONS.md`.
2. `git status`, `git log --oneline -15`, `git worktree list`. Vercel deploys branch
   `claude/epic-lamport-wvbbwz` to https://fantasy-football-xi-ecru.vercel.app. The 2026-10-26
   session worked on `claude/keen-lamport-ibcbi9` (it holds everything below; it is not deployed
   until merged or Vercel is pointed at it). Push only the branch your session was given; don't
   open PRs unless asked.
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
(`@theme` tokens in `app/globals.css`), GSAP 3.15 + `@gsap/react` (the only animation library),
Supabase (`@supabase/ssr`, Postgres + Auth + Realtime), Anthropic SDK (optional Start/Sit
wording), zod, Vitest 5, Node ≥ 22. Hosting: Vercel (app), Railway (worker, optional).

## Map

- `app/`: screens and route handlers. Nav (`lib/config.ts` `NAV`): Home `/`; Team (`/team`,
  `/team/matchup`, `/start-sit`, `/team/trades`, `/team/pickups`, `/players` rankings,
  `/team/edit`, `/team/import`, `/team/connect`); Live (`/feed`, `/games`, `/games/[id]`); News
  `/news`; Chat (`/chat`, `/chat/[room]`, `/u/[username]`); plus `/settings`, `/account`,
  `/auth/*`, `/offline`, `/players/[id]`. Old `/trades*`, `/players/pickups|watchlist`,
  `/team/rating` redirect. API: `/api/scoreboard`, `/api/live`, `/api/games/[id]`,
  `/api/player/[id]` (+ `/profile`), `/api/players`, `/api/teams`, `/api/universe`,
  `/api/startsit`, `/api/league`, `/api/news`, `/api/espn/connection`, `/api/espn/verify-league`,
  `/api/admin/session`.
- Overlays by URL: `?player=<id>` (the one player profile, `PlayerProfileHost`), `?user=<name>`
  (public profile, `UserProfileHost`), `?thread=<id>` (chat thread). Helpers in `lib/nav/query.ts`.
- `components/`: `ui/` primitives, `shell/` (TopBar, Sidebar, BottomBar, SectionTabs,
  GlobalSearch, BackButton, AdminIndicator), `motion/` (PageEnter, AnimatedNumber, useFlipList,
  useTweenTo, useArrivals, Enter, TouchdownBurst), `charts/`, `glass/LiquidGlass`, `pwa/`, and a
  folder per feature (home, team, teams, matchup, trades, players, player, live, feed, games,
  gamecenter, news, chat, profile, settings, startsit, auth).
- `lib/`: `providers/` (the only code that talks to ESPN; `types.ts` is the interface; ESPN
  leagues in `espn/league.ts`, news in `espn/news.ts`), `data/sports.ts` (cached server reads),
  `sync/` (the live-data client: `store.ts`, `useLive`, `freshness`), `fantasy/` (team context,
  projections, matchup analysis), `teams/` (multi-team store), `scoring/` (formats, K/DST,
  `spec.ts` league rules), `live/`, `startsit/`, `analysis/`, `players/`, `roster/` (adapter over
  the active team), `settings/`, `storage/persisted.ts`, `supabase/`, `chat/` (api, room store,
  unread store, attachments), `profiles/` (public profiles and teams), `admin/` + `entitlements/`
  (Admin Mode), `espn-link/` (encrypted ESPN cookies), `sound/`, `pwa/`, `motion/`, `glass/`.
- `supabase/`: three migrations (init; `20261026000000_community.sql`: channels, threads, polls,
  unread, mutes, public profiles, verified league rooms; `20261027000000_admin_mode.sql`) and
  RLS tests (`tests/`).
- `worker/`: Node live-data poller (ESPN → Supabase) for Railway, with replay mode; own README.
- `samples/`: real, trimmed ESPN responses tests are built against (incl. an anonymized league).
- `scripts/`: `test-db.sh`, `test-pwa.mjs`, `store-screenshots.mjs`, `admin-code-hash.mjs`.
- `docs/SETUP.md`: click-by-click setup for Vercel, Supabase, private leagues, Admin Mode, Railway.

## Built and working

- Several fantasy teams (hand-built and ESPN league teams) with a selector at the top of Home;
  the selected team sets every screen. ESPN leagues: public by id/link, private with the user's
  encrypted ESPN login; roster, scoring rules, record and matchup sync from the league.
- Home command center (matchup or week, recommended actions, live now, team health, news).
  Team: lineup with live points and possession, health, weekly chart; Matchup (both rosters,
  win probability, advantages/drivers); Start/Sit (league scoring); Trades (ideas + calculator);
  Pickups; Rankings explorer. One player profile everywhere (fantasy stats, charts, news).
- Live: Key plays, All plays, My players, Opponent, Player tracker; Games board; Game Center
  (with a link to its chat room). One live-data client; honest freshness; 2-decimal points.
- News: League news and Your players from ESPN, linking out.
- Chat (needs Supabase): channels, a room per game this week (live score header, ESPN scoring
  plays as events), per-player rooms, private league rooms for server-verified members;
  replies, threads, reactions, @player mentions, polls, trade and game cards, unread counts,
  presence, search, failed-send retry; report, mute, block, delete; moderators' reports queue.
- Public profiles: opt-in teams and details, primary team, bio; private by choice.
- Admin Mode (needs its server secrets; see docs/SETUP.md 4c) and central entitlements.
- Settings: per-team league size and taken players, ESPN connection, liquid glass, animations,
  touchdown sound, install/updates, saved data, Admin Mode.
- Installable PWA, verified on production builds (see Validation).

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
  tabular figures, colour only on data (`#4c8dff` is the data hue and also "good"; no green),
  one white primary pill per screen, tokens in `app/globals.css` only, text fields ≥ 16px. The
  owner rejected a purple/gradient redesign: **run the taste skill before any design change**
  (`lint.mjs --app`, `inspect.mjs --app` at 1440/768/390 must show 0 FAIL). Owner wants all
  animations: GSAP only; `PageEnter` animates every `.card`; respect `html[data-motion]`; pass
  `yPercent: 0` with `y` tweens.
- **Admin code:** never write the administrator code anywhere (code, tests, docs, commits,
  env files). It lives only as a hosting secret (`ADMIN_ACCESS_CODE_HASH`). Search the repo,
  history and build output for it before committing Admin Mode changes.
- **Chat honesty:** no fake users, messages or counts; presence is Realtime presence only;
  league rooms only for server-verified members; never attach roster/league/ESPN data to
  messages unless the author chose a card.
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
changes also `node scripts/test-pwa.mjs` (needs playwright-core + Chromium; see its header; in
this sandbox `PLAYWRIGHT_CORE=/opt/node22/lib/node_modules/playwright
CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`).
Last full run (2026-10-27): lint clean, 633 tests, build OK, 170 DB checks, PWA 48/48, Taste
lint 0 FAIL and inspect 0 FAIL on the main screens. (PWA: 45/48 on the full run, the 3 misses were the test still expecting the old "Plays" title; fixed and re-run 40/40 with the update and dev rounds skipped, which had passed.)
Sandbox: kill servers by process group, never `pkill` by pattern; a scratch copy with
hard-linked `node_modules` is the safe place for builds while editing elsewhere. Root-layout
changes may need a `next dev` restart to show. Chat can only be clicked through here against a
scratch-only Playwright fake of Supabase (REST/Auth/Realtime); real use needs a Supabase project.

## Current state (2026-10-27)

Branch `claude/keen-lamport-ibcbi9`, pushed, not yet deployed (Vercel deploys
`claude/epic-lamport-wvbbwz`). The owner's big upgrade brief (fantasy-first Home, multiple
teams and ESPN leagues, matchup, live tabs and tracker, news, community chat, public profiles,
Admin Mode, GSAP-only motion, full QA) is built and validated as listed above.

## Unfinished / known issues

- Supabase, Railway and the Admin Mode secrets aren't set up on the owner's side yet (chat,
  sync, profiles, private leagues and Admin Mode stay "not set up" until then; docs/SETUP.md).
- Not yet checked against a real Supabase project or during a real live NFL game: Realtime
  chat delivery at scale, live possession/down-and-distance parsing, the D/ST two-way-player
  stat question in `fantasyStatsToStatLine`.
- Published profile teams are per device (`local_id`), so the same team published from two
  devices appears twice.
- Push notifications: not built (need VAPID keys, a subscriptions table, the worker running).
- `lib/players/search.ts` powers GlobalSearch, chat and pickers; PlayerBrowser was replaced by
  Rankings.

## Suggested next work (recommendation, not confirmed requirements)

1. Deploy: merge `claude/keen-lamport-ibcbi9` (or point Vercel at it), then follow
   docs/SETUP.md parts 4, 4b and 4c.
2. A real game-day check of live parsing, chat Realtime and freshness.
3. Push notifications for your players' touchdowns, if the owner wants them.
