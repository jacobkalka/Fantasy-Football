# Decisions

Every meaningful choice, newest at the bottom of each section, with the reason. Read this first when
picking the project back up.

## Product

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | **Look: Direction A, "Control Room"** (near-black terminal, electric lime `#C8FF2E` for points gained, red with a − sign for points lost, hairline borders, square corners). Chosen by the owner from three mockups (A Control Room, B Primetime, C Box Score). | Closest to the brief: "broadcast control room meets trading terminal". |
| 2026-10-22 | App name is a placeholder (`Snap Count`) in `lib/config.ts`. | The owner hasn't picked a name yet; it's one constant to change. |
| 2026-10-22 | Unbuilt tabs show an honest "Arrives in phase N" panel, and the Team tab shows build progress (`lib/roadmap.ts`). | The live URL stays working and truthful at every step; no fake data. |

## Stack

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | Next.js **16.4** (App Router) + TypeScript + Tailwind CSS **4**, scaffolded with `create-next-app` defaults, which turn on **Cache Components** and **Partial Prefetching**. | Plan's stack; current defaults. Next 16 differs from older docs: read `node_modules/next/dist/docs/` before using an API (see `AGENTS.md`). |
| 2026-10-22 | Fonts: Barlow Condensed (scores, headings), Inter (text), JetBrains Mono (labels, clocks), loaded with `next/font`. | Direction A. `next/font` self-hosts them: no layout shift, no third-party requests. |
| 2026-10-22 | All colors/fonts are tokens in `app/globals.css` (`@theme`). Components use token names only (`bg-ground`, `text-gain`, `font-display`). | Restyling means editing one block. |
| 2026-10-22 | Fixed-width digits (`tabular-nums`) only on `.font-display`, not the whole page. | Applied globally, Inter also widens hyphens ("Play - by - play"). |
| 2026-10-22 | The tab bar (reads the URL) sits inside `<Suspense>`. | Under Cache Components, `usePathname` suspends on dynamic URLs like `/games/[id]`; without Suspense the build fails. |
| 2026-10-22 | Tests: Vitest 5 (`npm test`), config in `vitest.config.mts`. `@types/node` bumped to 22 to match Node 22 and satisfy Vitest's peer range. | `.mts` loads the config as ESM without a warning. |
| 2026-10-22 | Supabase env names use the new key types: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. | Supabase replaced "anon"/"service_role" JWT keys with publishable/secret keys for new projects. |

## Data

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | The app has its own stat vocabulary (`lib/stats.ts`: `passYds`, `recTd`, `fumLost`…). Each data provider translates into it. | Scoring and UI never depend on ESPN's field names, so a provider can be swapped. Kicker and D/ST keys come later. |
| 2026-10-22 | **Phase 1 waits for real ESPN samples.** ESPN's hosts are blocked by the cloud dev environment's network policy (proxy returns 403), so `/samples` and the ESPN provider aren't written yet. | Plan rule: look before you build. No invented ESPN responses. The deployed app on Vercel is not affected by this block. |

## Scoring engine (`lib/scoring`)

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | Presets match ESPN's default offense: 0.04/pass yd, 4/pass TD, −2/INT, 0.1/rush or rec yd, 6/rush or rec TD, 2/2-pt, −2/fumble lost, 6/return or fumble-recovery TD; receptions 0 / 0.5 / 1 for standard / half / PPR. Presets are frozen. | Plan section 5.1. Imported ESPN leagues will supply their own rules (Phase 9). |
| 2026-10-22 | `roundPoints` rounds to 2 decimals, halves away from zero, strips float noise, never returns −0. Totals are the rounded sum of exact values (not the sum of rounded parts). | Avoids `0.30000000000000004`-style errors; totals stay exact. |
| 2026-10-22 | Feed breakdowns keep up to 2 decimals ("+2.96 yds") while headline points show 1 ("+9.4"). | With 1 decimal, a 1-yard pass would read "+0 yds". |
| 2026-10-22 | Breakdown order: passing → rushing → receiving → return TDs → fumbles; yards, TD, 2-pt, then receptions. | Produces the plan's "+7.4 yds, +6 TD, +1 reception". |
| 2026-10-22 | `reconcile()` compares rounded drift to a 0.05 tolerance and always returns the **official** number as the headline. It doesn't log; callers log when `ok` is false. | Plan 5.3: official totals win; the function stays pure and testable. |
| 2026-10-22 | Tests use hand-computed stat lines for now. Real finished-game box scores get added as fixtures once ESPN samples exist. | Can't fetch ESPN from the dev environment yet. |

## Tooling and process

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-22 | The "impeccable" and "oh-my-claude" plugins the owner asked for aren't in their plugin catalog, so they couldn't be used. Design used the plan's direction plus three mockups; parallel work used Claude Code's built-in background agents (one built the scoring engine, one the database schema). | Closest available substitute. |
