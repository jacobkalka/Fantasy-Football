# Setup guide

Step-by-step instructions for the accounts and settings this app needs. Do each part when the
build reaches it; you don't need everything on day one.

| Part | What | Needed for |
|------|------|------------|
| [1](#1-put-the-app-online-vercel) | Put the app online (Vercel) | Now (Phase 0) |
| [2](#2-let-claude-reach-espn) | Let Claude reach ESPN's data | Now (before Phase 1) |
| [3](#3-environment-variables-in-plain-english) | Environment variables, explained | Read once |
| [4](#4-create-the-database-supabase) | Create the database (Supabase) | Phase 3–4 |
| [5](#5-the-live-data-worker-railway) | The live-data worker (Railway) | Phase 3 |

---

## 1. Put the app online (Vercel)

Vercel takes the code on GitHub and turns it into a website. Every time new code is pushed,
Vercel rebuilds the site automatically.

1. Go to **vercel.com** and click **Sign Up**.
2. Choose **Hobby** (the free plan) and pick **Continue with GitHub**. Sign in with the GitHub
   account that owns `jacobkalka/Fantasy-Football`.
3. On your Vercel dashboard click **Add New…** → **Project**.
4. Under **Import Git Repository**, find **Fantasy-Football** and click **Import**.
   - Not in the list? Click **Adjust GitHub App Permissions** (or "Configure GitHub App"), give
     Vercel access to the `Fantasy-Football` repository, then come back.
5. Vercel detects it's a Next.js app. Leave every setting as it is and click **Deploy**.
6. Wait about a minute. When you see the confetti, click the preview image (or **Continue to
   Dashboard** → **Visit**). That's your live URL. Bookmark it on your phone.

**What you should see:** a dark screen with the app name in the top left, "MY TEAM" in big
letters, a build-progress list, and a tab bar along the bottom (Team · Feed · Games · Start/Sit ·
Chat). Tap the tabs; each one says which phase brings it to life.

> **Which code is online?** Vercel publishes the repository's *default branch*. Right now the
> only branch is the one Claude works on, so that's what you'll see. Later we can set up a `main`
> branch so only finished work goes live.

## 2. Let Claude reach ESPN

The live scores come from ESPN's public data. The cloud computer Claude works on has a
firewall that currently blocks ESPN, so Claude can't look at real responses before building
Phase 1. (Your live site on Vercel is **not** affected; this is only about Claude's workspace.)

1. In the Claude app, open this coding session.
2. At the top, open the **cloud environment** menu (it shows the environment's name) and click
   **Edit** (on some versions this is under **Settings**).
3. Find **Network access**. Either:
   - choose a broader access level, **or**
   - keep **Limited** (or **Custom**) and add these under **Allowed domains**, leaving
     **Allow package managers** ticked:
     ```
     site.api.espn.com
     site.web.api.espn.com
     sports.core.api.espn.com
     a.espncdn.com
     fantasy.espn.com
     lm-api-reads.fantasy.espn.com
     ```
4. Save. Then tell Claude it's done. You may need to start a new session for the change to apply.

Official instructions: <https://code.claude.com/docs/en/cloud-environments#network-access>

## 3. Environment variables in plain English

Some settings are secret, like passwords and keys to other services. They can't go in the code,
because the code is on GitHub where others could read it. Instead they're stored as
**environment variables**: named values (like `SUPABASE_SECRET_KEY=abc123…`) that you type into
a settings screen, and the app reads them while it runs.

There are two places they live:

- **On Vercel** (for the live site): Project → **Settings** → **Environment Variables**. Type the
  name in *Key*, paste the value in *Value*, click **Save**. Then redeploy (Deployments → ⋯ →
  **Redeploy**) so the site picks them up.
- **In a file called `.env.local`** (only if you ever run the app on your own computer). This
  file is ignored by git, so it never gets uploaded.

The file `.env.example` in the project lists every variable name with blank values. It's a
checklist, not a place for real secrets.

Two rules:

1. **Never paste a secret into chat, code, or a GitHub issue.** Only into Vercel/Supabase/Railway
   settings screens.
2. Names that start with `NEXT_PUBLIC_` are visible to anyone using the site. Only non-secret
   values get that prefix.

## 4. Create the database (Supabase)

*Needed from Phase 3/4. Skip for now.*

Supabase stores accounts, rosters and chat, and pushes live updates to everyone's screen.

1. Go to **supabase.com** → **Start your project** → sign in with GitHub.
2. Click **New project**. Pick your organization (create one if asked, free plan).
3. Fill in:
   - **Name:** `fantasy-football`
   - **Database password:** click **Generate a password**, then save it in a password manager.
     (You'll rarely need it, but it can't be shown again.)
   - **Region:** the one closest to you (e.g. *East US*).
4. Click **Create new project** and wait a couple of minutes.
5. Get the three values the app needs. Click **Connect** at the top of the project (or go to
   **Project Settings** → **API Keys**):
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (starts with `sb_publishable_`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Secret key** (starts with `sb_secret_`, click to reveal) → `SUPABASE_SECRET_KEY`.
     This one is a master key: it goes only into Vercel/Railway settings, nowhere else.
6. Add all three to Vercel as described in [part 3](#3-environment-variables-in-plain-english).
7. Set up the tables: open **SQL Editor** in Supabase, paste each file from
   `supabase/migrations/` in order (oldest first), and click **Run**. Details are in
   `supabase/README.md`.
8. **Sign-in settings** (Authentication in the left menu):
   - **URL Configuration** → **Site URL**: your Vercel address (e.g.
     `https://fantasy-football-xi-ecru.vercel.app`). **Redirect URLs**: add
     `http://localhost:3000/**`, `https://<your-app>.vercel.app/**`, and for preview
     deployments `https://*-<your-vercel-team>.vercel.app/**`.
   - **Email**: Supabase's built-in email sender only delivers to members of your Supabase
     project, and only a few per hour. For friends to sign in, set up an email service under
     **Authentication → SMTP Settings** (Resend has a free plan), or add their emails as project
     members while testing.
   - Optional but recommended, **Email Templates**: add `{{ .Token }}` to the "Magic Link" and
     "Confirm signup" emails so the 6-digit code works when the email opens in a different app,
     and in the iPhone Home Screen app (there the link opens Safari, so typing the code is the
     way to sign in).
   - Optional, **Google sign-in**: in Google Cloud Console create an OAuth client (Web
     application) with redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, then
     paste its ID and secret under **Authentication → Sign In / Providers → Google**. The Google
     button appears in FantasyLab by itself once this is on.
9. **Realtime**: the migrations already turn it on for chat. Check under **Database →
   Publications** that `messages`, `message_reactions`, `chat_poll_votes` and `chat_rooms` are
   listed. (There are three migration files now: the original tables, the community chat and
   public profiles, and Admin Mode. Run all three, oldest first.)
10. Make yourself the chat moderator: in **SQL Editor** run
    `update public.profiles set is_admin = true where username = 'your-username';`
### 4b. Private ESPN leagues and league chat

Public ESPN leagues work with nothing extra. For **private** leagues (and the private league
chat room, which checks with ESPN that you're really in the league), the server stores your ESPN
login encrypted:

1. Make a random key on your computer: open Terminal and run `openssl rand -base64 32`.
2. Add it to Vercel as `ESPN_COOKIE_ENCRYPTION_KEY` (part 3). It needs `SUPABASE_SECRET_KEY` too.
3. In the app: **Settings → ESPN connection**, or **Team → Connect a league**, and follow the
   steps there to paste the two ESPN values (`espn_s2` and `SWID`).

### 4c. Admin Mode (optional)

Admin Mode is switched on in **Settings → Admin Mode** by typing the administrator code. The
code is checked only on the server. It is never in the app's code, GitHub, or any file: you give
the server a scrambled version of it (a "hash") that can check a typed code but can't be turned
back into it.

1. On your own computer, in the project folder, run `node scripts/admin-code-hash.mjs`. Type the
   code when it asks (it isn't shown). It prints one line starting `ADMIN_ACCESS_CODE_HASH=`.
2. In Vercel → Project → **Settings → Environment Variables**, add:
   - `ADMIN_ACCESS_CODE_HASH` = the long value after the `=` from step 1.
   - `ADMIN_SESSION_SECRET` = a new random value from `openssl rand -base64 32`.
   Both must be plain names: never add `NEXT_PUBLIC_` to them.
3. Make sure the Admin Mode migration ran (part 4, step 7) and `SUPABASE_SECRET_KEY` is set.
4. Redeploy. If anything is missing, Admin Mode simply says it isn't set up: there's no
   built-in code to fall back to.

How it's protected: you must be signed in; every wrong code gets the same answer after the same
delay; 5 wrong codes in 15 minutes (or 20 in a day) lock that account and that network for a
while; a correct code gives this browser an 8-hour Admin Mode that the server re-checks on every
request, and **Disable Admin Mode** ends it at once. To change the code, make a new hash and
replace the Vercel value.

## 5. The live-data worker (Railway)

*Optional: the app works without it (each phone asks for fresh scores itself). Set it up after
the database (part 4).*

Vercel runs code only when someone loads a page, so it can't watch games all Sunday. The worker
(`worker/`) runs nonstop on Railway, checks ESPN every few seconds during games, and saves new
plays, points and injury changes to Supabase. One worker serves every user.

1. Make sure the database tables exist (part 4, step 7).
2. Go to **railway.com** and sign in with GitHub.
3. **New Project** → **Deploy from GitHub repo** → pick this repository. If it isn't listed,
   click **Configure GitHub App** and give Railway access to it.
4. The first automatic deploy may fail; that's expected. Click the service, then **Settings**:
   - **Root Directory**: leave empty (the worker uses the shared `lib/` folder).
   - **Custom Build Command**: `npm ci --prefix worker`
   - **Custom Start Command**: `node worker/start.mjs` (not `npm start`: npm doesn't pass on
     the stop signal, so the worker couldn't shut down cleanly)
   - **Healthcheck Path**: `/health`
   - **Restart Policy**: On Failure · **Replicas**: 1
   - **Watch Paths** (optional): `/worker/**` and `/lib/**`
5. In Supabase click **Connect** → **Connection String** → type **URI**, method **Session
   pooler**, and copy it. Replace `[YOUR-PASSWORD]` with the database password (if you lost it,
   reset it under Project Settings → Database; avoid `@`, `#` and `/` in it).
6. In Railway open **Variables** → **New Variable**: name `DATABASE_URL`, value the string from
   step 5. Don't add `PORT` (Railway sets it). Railway redeploys by itself.

**Is it working?** In Railway's **Deploy Logs** you should see `database connected`,
`worker starting…`, and a `tick` line every few minutes (every few seconds during games). In
Supabase's **Table Editor**, `teams` has 32 rows, `games` has this week's games and `players`
about 1,050. Under **Settings → Networking → Generate Domain**, visiting `/health` shows `ok`.
Optional tuning variables are listed in `.env.example` and `worker/README.md`.
