# FantasyLab

A live fantasy football tracker. ESPN's app tells you your score; this tells you **what
happened**: every play that moved your players' points, in plain English, as it happens.

> Not affiliated with ESPN or the NFL.

## Install it on your phone

FantasyLab installs like an app: its own Home Screen icon, full screen, and screens you've
opened still show without a connection (live scores, projections and news always load fresh).

- **iPhone / iPad:** open the site in Safari → Share → **Add to Home Screen** → Add. The app
  keeps its own saved data, separate from Safari, so copy your team link first (the app's
  install steps include a button) and tap **Paste team link** when the app opens.
- **Android / Chrome / Edge:** tap **Install** on the Home screen card (or Settings → The app).
- **Mac Safari:** File → Add to Dock.

How it works and what is (and never is) stored offline: `DECISIONS.md` → "Installable app".
Checked end to end with `node scripts/test-pwa.mjs`.

## Where things are

| Path | What it is |
|------|------------|
| `app/` | The screens. Each folder is a page: `feed/`, `games/`, `start-sit/`, `chat/`; `page.tsx` is the Team tab. |
| `components/` | Reusable pieces of the UI (tab bar, header, panels). |
| `lib/config.ts` | App name and tab list. |
| `lib/stats.ts` | The app's own names for football stats; every data source maps into these. |
| `lib/scoring/` | Turns stats into fantasy points (standard, half-PPR, PPR), with tests. |
| `supabase/` | Database tables and security rules. |
| `app/globals.css` | Colors and fonts in one place. |
| `public/sw.js`, `components/pwa/`, `app/manifest.ts` | The installable app: offline support, install steps, update prompt. |
| `DECISIONS.md` | Every choice made so far, and why. |
| `docs/SETUP.md` | Step-by-step account setup (Vercel, Supabase, ...). |
| `.env.example` | List of secret settings the app will need (blank template). |

## Running it

You don't need to run anything locally: Vercel builds and hosts it (see `docs/SETUP.md`). If you
ever want to run it on your own computer:

```bash
npm install      # once, downloads the libraries
npm run dev      # starts the app at http://localhost:3000
npm test         # runs the automated tests
npm run lint     # checks the code for common mistakes
npm run build    # the same production build Vercel runs
```

## Build plan

Built in phases; each one is finished, working, and committed before the next starts. Current
state, what's unfinished and how to pick the work back up: `CLAUDE.md`.
