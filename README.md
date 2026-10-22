# The Feed

A live fantasy football tracker. ESPN's app tells you your score; this tells you **what
happened**: every play that moved your players' points, in plain English, as it happens.

> Not affiliated with ESPN or the NFL.

## Where things are

| Path | What it is |
|------|------------|
| `app/` | The screens. Each folder is a page: `feed/`, `games/`, `start-sit/`, `chat/`; `page.tsx` is the Team tab. |
| `components/` | Reusable pieces of the UI (tab bar, header, panels). |
| `lib/config.ts` | App name and tab list. |
| `lib/stats.ts` | The app's own names for football stats; every data source maps into these. |
| `lib/scoring/` | Turns stats into fantasy points (standard, half-PPR, PPR), with tests. |
| `supabase/` | Database tables and security rules. |
| `app/globals.css` | Colors and fonts (the "Control Room" look) in one place. |
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
progress is shown on the app's Team tab and in `lib/roadmap.ts`.
