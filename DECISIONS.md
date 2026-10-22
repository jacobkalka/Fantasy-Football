# Decisions

Every meaningful choice, newest at the bottom of each section, with the reason. Read this first when
picking the project back up. Decisions that were later replaced are marked ~~struck through~~ with a
pointer to what replaced them.

## Product

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | **Look: Direction A, "Control Room"** (near-black terminal, electric lime `#C8FF2E` for points gained, red with a − sign for points lost). Chosen by the owner from three mockups (A Control Room, B Primetime, C Box Score). | Closest to the brief: "broadcast control room meets trading terminal". |
| 2026-10-22 | **Name: The Feed** (chosen by the owner over Snap Count, Drive Report, Red Zone Radio). Lives in `lib/config.ts` as `APP_NAME`. | Owner's choice. One constant to change. |
| 2026-10-22 | ~~Unbuilt tabs show "Arrives in phase N" and the Team tab shows build progress.~~ Replaced once the real screens shipped (`lib/roadmap.ts` removed). | Kept the live URL truthful while it was a skeleton. |
| 2026-10-22 | **Liquid glass + 3D + motion** on top of Control Room (owner's request): translucent panels with a bright top edge over a lit stage (drifting light + a 3D grid floor), cards that tilt toward your finger, rolling score digits, sliding glass tab bar, directional screen slides, team-color glows, touchdown bursts. Square corners became rounded (liquid glass is inherently rounded). | "I want the UI to have a 3d look, liquid glass, and good animations throughout the entire app." |
| 2026-10-22 | **Roster lives on the device first** (localStorage, `lib/roster/store.ts`): no account needed to use the app. When accounts are configured it also syncs to Supabase. | Works on day one without any account setup; Tier A (manual roster) always works, per the plan. |
| 2026-10-22 | The Feed defaults to **Key plays** (worth ≥ 1 point, a touchdown, or an injury); "All plays" shows every point-moving play. | Every 1-yard completion is a +0.04 entry for a QB; the default view should tell the story, not the noise. |
| 2026-10-22 | **Replay mode** is client-side: finished games (Game Center) and finished weeks (Feed) replay their real plays on a sped-up clock (30×/60×/180×). | Lets the app be tested and demoed on days without games, with real data, no database needed. |
| 2026-10-22 | Finished games show ESPN's **pregame** projection ("proj 15.9"); live games show a running estimate ("est 21.3") = points so far + the share of the projection still to play. | Lets you see who beat their projection; estimates are labeled as estimates. |
| 2026-10-22 | Kickers and D/ST can be rostered; their scoring was deferred by the plan and is being added next (shows "pts soon" until then). | Plan §5.1: "Kicker / defense (D/ST) scoring in a later phase." |

## Stack

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | Next.js **16.4** (App Router) + TypeScript + Tailwind CSS **4**, scaffolded with `create-next-app` defaults, which turn on **Cache Components** and **Partial Prefetching**. | Plan's stack; current defaults. Next 16 differs from older docs: read `node_modules/next/dist/docs/` before using an API (see `AGENTS.md`). |
| 2026-10-22 | Fonts: Barlow Condensed (scores, headings), Inter (text), JetBrains Mono (labels, clocks), loaded with `next/font`. | Direction A. `next/font` self-hosts them. |
| 2026-10-22 | All colors, fonts and glass surfaces are tokens/utilities in `app/globals.css` (`@theme`, `@utility glass`, `glass-chip`, `glass-gain`, `glass-bar`, `pressable`). Components use token names only. | Restyling means editing one file. |
| 2026-10-22 | Fixed-width digits only on `.font-display` / `.tabular`, not the whole page. | Applied globally, Inter also widens hyphens ("Play - by - play"). |
| 2026-10-22 | The tab bar (reads the URL) sits inside `<Suspense>`. Pages that read `?week=` do too. | Under Cache Components, URL hooks suspend; without Suspense the build fails. |
| 2026-10-22 | Tests: Vitest 5 (`npm test`), config in `vitest.config.mts`. `@types/node` 22. | `.mts` loads the config as ESM without a warning. |
| 2026-10-22 | Supabase env names use the new key types: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. | Supabase replaced "anon"/"service_role" keys with publishable/secret keys. |
| 2026-10-22 | **Never give a glass element a `view-transition-name`.** Header and tab bar aren't named at all; only page content (wrapped in `<Screen>`) slides. | Chromium stops blurring what's behind an element that has a view-transition name (verified by screenshots). |
| 2026-10-22 | `body` background is transparent; `html` paints the base color. | The ambient stage sits at `z-index: -1`; a painted body background hides it. |
| 2026-10-22 | Screen transitions use React 19.3's `<ViewTransition>` (page slides by tab direction, game card → Game Center morph, skeleton → content reveal). In-page motion uses the Motion library (`motion/react`). `MotionConfig reducedMotion="user"` + CSS media query respect "reduce motion". | Native, declarative transitions where the browser supports them; graceful no-animation fallback elsewhere. |
| 2026-10-22 | Images go through a custom `next/image` loader (`lib/espn-image-loader.ts`) that asks ESPN's CDN combiner to resize (230 KB headshot → ~7 KB). | Fast on phones and no Vercel image-optimization quota. |
| 2026-10-22 | App icons were rendered from an HTML design with headless Chromium into `public/` and `app/icon.png` / `app/apple-icon.png`; `app/manifest.ts` makes the app installable. Push notifications are a later stretch (they need VAPID keys and the database). | Installable PWA per Phase 10; installing doesn't require offline support. |
| 2026-10-22 | **Sandbox only:** Node's `fetch` here needs `NODE_USE_ENV_PROXY=1` to reach ESPN through Claude's cloud proxy. Vercel doesn't need it. | Without it, server code in this environment gets `ENOTFOUND`. |

## Data (ESPN)

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | The app has its own stat vocabulary (`lib/stats.ts`). Each data provider translates into it. | Scoring and UI never depend on ESPN's field names, so a provider can be swapped. |
| 2026-10-22 | ~~Phase 1 waits for real ESPN samples (ESPN blocked by the dev environment).~~ Unblocked once the owner allowed ESPN's hosts; real responses are saved in `samples/`. | Look before you build. |
| 2026-10-22 | **Provider interface** (`lib/providers/types.ts` `DataProvider`), ESPN implementation in `lib/providers/espn/`, and `lib/providers/index.ts` exports the active one as `sports`. App code never touches ESPN URLs directly. | Plan §4.1; a paid provider can replace ESPN in one line. |
| 2026-10-22 | Endpoints used: site `scoreboard` and `summary` (game header, drives, box score, win probability, odds), **core API `plays`** (play-by-play with participants and roles), site `teams`, `injuries`, fantasy `players_wl` (all players, for search), fantasy `kona_player_info` (injury status, weekly stats, projections, outlook text), fantasy `proTeamSchedules_wl` (bye weeks), fantasy news feed. | All verified with real calls; samples in `samples/`. |
| 2026-10-22 | **Per-player news uses ESPN's fantasy news feed** (`/apis/fantasy/v2/games/ffl/news/players?playerId=`), not `news?athlete=`. | The site news endpoint ignores its `athlete` filter (it returned general NFL news for Mahomes). |
| 2026-10-22 | Core API `$ref` links can point at an internal host (`sports.core.api.espn.pvt`); ids are extracted with a regex and never fetched. | Following those links fails from outside ESPN. |
| 2026-10-22 | ESPN fantasy stat ids, verified against the box score and ESPN's own PPR totals: 0 passAtt, 1 passCmp, 3 passYds, 4 passTd, 19 pass2pt, 20 passInt, 23 rushAtt, 24 rushYds, 25 rushTd, 26 rush2pt, 42 recYds, 43 recTd, 44 rec2pt, 53 rec, 58 targets, 72 fumLost (68 = all fumbles), 101/102 return TDs, 63 fumble-recovery TD (lower confidence). `leaguedefaults/3` = ESPN's default PPR league. | Projections and weekly stats come in these ids. |
| 2026-10-22 | **Play attribution** (`lib/providers/espn/stats/plays.ts`): stat changes per play come from the play type, participant roles and the play text. Rules: yards from the text, not `statYardage` (that's the team's net, 0 on fumbles lost, includes penalty yards); "No Play" counts nothing; replay reversals count only the post-reversal text; penalties enforced inside a gain cap the yards at the spot; fumbles lost = capital "RECOVERED by"; muffed punt lost = fumble lost; aborted snap = 1 carry 0 yards; interception = a target for the intended receiver; laterals credit both; 2-pt only when "ATTEMPT SUCCEEDS"; a blocked-punt TD is a D/ST TD, not a return TD. | Validated on all 14 Week 6 games: 264/268 players match the official box score exactly; total drift 0.2 PPR points. The 4 leftovers are official corrections not visible in the plays. |
| 2026-10-22 | **Official numbers win**: a player's headline points come from the box score (+ 2-point conversions from the plays, which box scores omit); per-play points are shown in the feed, and any gap is shown on the player card as an "official stat correction". | Plan §5.3. Matches ESPN's own fantasy totals on every tested player. |
| 2026-10-22 | **Live data without a worker:** API routes (`/api/scoreboard`, `/api/live`, `/api/games/[id]`, `/api/player/[id]`, `/api/players`, `/api/teams`) read ESPN through `lib/data/sports.ts`, which caches each call for all visitors with `"use cache: remote"` and custom `cacheLife` profiles (`live` 5 s, `final`, `outlook`, `reference` in `next.config.ts`). Phones poll every ~6–8 s while games are live, less otherwise, pause when hidden, and back off on errors while keeping the last good data ("Data delayed"). | Plan §3 allows this for early phases; ESPN load scales with games, not users. The worker (Phase 3) adds push updates and history on top. |
| 2026-10-22 | Live pages fetch at request time (`connection()`), never at build time. | A deploy must not fail (or bake in stale scores) if ESPN is slow during the build. |
| 2026-10-22 | Dark team colors (e.g. Houston navy) are swapped for the team's alternate color in rings and glows (`lib/color.ts`). | Otherwise they're invisible on the near-black background. |
| 2026-10-22 | Play text is cleaned for display: formation notes, tackler names, assist brackets and "reported in as eligible" notes are removed (`lib/live/play-text.ts`). | Plan §5.4. |

## Scoring engine (`lib/scoring`)

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | Presets match ESPN's default offense: 0.04/pass yd, 4/pass TD, −2/INT, 0.1/rush or rec yd, 6/rush or rec TD, 2/2-pt, −2/fumble lost, 6/return or fumble-recovery TD; receptions 0 / 0.5 / 1 for standard / half / PPR. Presets are frozen. | Plan §5.1; verified: our points equal ESPN's own PPR totals for real Week 6 players. |
| 2026-10-22 | `roundPoints` rounds to 2 decimals, halves away from zero, strips float noise, never returns −0. Totals are the rounded sum of exact values. | Avoids `0.30000000000000004`-style errors. |
| 2026-10-22 | Feed breakdowns keep up to 2 decimals ("+2.96 yds") while headline points show 1 ("+9.4"). | With 1 decimal, a 1-yard pass would read "+0 yds". |
| 2026-10-22 | `reconcile()` compares rounded drift to a 0.05 tolerance and always returns the **official** number as the headline. | Plan §5.3. |

## Database (Supabase)

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | One migration (`supabase/migrations/20261022000000_init.sql`) with RLS on every table; every permission granted explicitly. `scripts/test-db.sh` runs 115 security checks on a throwaway local Postgres. | Plan §9 and §12, provable without a Supabase project. |
| 2026-10-22 | ESPN cookie table: RLS on with no policies and all grants revoked, so only the server can touch it; the browser can only call `my_espn_connection_status()` and `delete_my_espn_connection()`. | Cookies act like a login; they must never reach the browser. |
| 2026-10-22 | Deleting a chat message wipes its text (a moderator copy is kept on reports); `messages.deleted_by` references `auth.users`; rooms are created through `ensure_game_room` / `ensure_league_room`; admins can read every room; blocking is enforced in the database; roster player ids are plain text (no foreign key) because a player may be added before the worker stores him. | Privacy for deleted text; unambiguous joins; rooms can't be spammed; moderation works; no ordering problems. |
| 2026-10-22 | The owner becomes admin once, in the Supabase SQL Editor: `update public.profiles set is_admin = true where username = '…';` | `is_admin` can't be self-granted from the app. |

## Tooling and process

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | The "impeccable" and "oh-my-claude" plugins the owner asked for aren't in their plugin catalog. Design used the plan plus mockups; parallel work uses Claude Code's built-in background agents (scoring engine, database, play attribution, Start/Sit, worker, accounts + chat, K/DST scoring). | Closest available substitute. |
| 2026-10-22 | Every commit must pass `npm run lint`, `npm test`, `npm run build` (here: `NODE_USE_ENV_PROXY=1 npm run build`) and `bash scripts/test-db.sh`. | "Never leave the app broken between phases." |
