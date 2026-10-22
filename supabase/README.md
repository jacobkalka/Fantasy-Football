# Database (Supabase)

This folder is the blueprint for the app's database: which tables exist and, just as important,
**who is allowed to read or change each one**.

| Path | What it is |
|------|------------|
| `migrations/` | The blueprint itself, as SQL files. Each file is one step; they run in filename order (the number at the start is a date). Today there's one: `20261022000000_init.sql`. |
| `tests/local_stub.sql` | A fake, bare-bones "Supabase" used **only** by the automatic tests. |
| `tests/rls_test.sql` | The security tests: they sign in as pretend users and try to break every rule. |

## The rules in one table

Row Level Security (RLS) is switched on for every table: nobody sees a row unless a rule allows it.
"The server" means our own backend and live-data worker, which use the secret key and are never
in a browser.

| Data | Signed-out visitors | Signed-in users | The server |
|------|---------------------|-----------------|------------|
| NFL data: teams, players, games, plays, points, stats, injuries, news | read | read | read + write |
| Profiles (username, picture, favourite team) | – | read all; edit only their own (never the admin flag) | everything |
| Rosters and roster players | – | only their own | everything |
| ESPN login cookies (`espn_connections`) | – | **never**, not even their own. They can only ask "am I connected?" and press "disconnect". | everything |
| Chat rooms and messages | – | global and game rooms; league rooms only if they have a roster in that league. Post as themselves, max 1 message per second. Delete their own messages (admins: any). | everything |
| Reactions, reports, blocks | – | their own; admins see all reports | everything |

## Applying it to your Supabase project

Do this once, after you create the Supabase project (see `docs/SETUP.md`).

**Option A: in the browser (easiest)**

1. Open your project at **supabase.com/dashboard**.
2. In the left sidebar click **SQL Editor**, then **New query**.
3. Open `supabase/migrations/20261022000000_init.sql` (on GitHub or in your editor), copy **all** of
   it, paste it into the editor and click **Run**. If Supabase asks you to confirm, confirm.
4. You should see "Success. No rows returned". Click **Table Editor** in the sidebar: the tables
   (profiles, rosters, games, messages, …) are there.
5. When later migration files appear, run each one the same way, **oldest first** (by the number
   at the start of the filename), and only once.

**Option B: with the Supabase command-line tool** (if it's installed)

```bash
supabase login
supabase init            # only if supabase/config.toml doesn't exist yet
supabase link --project-ref <your-project-ref>   # the ref is in your project's URL
supabase db push         # runs every migration the project hasn't had yet, in order
```

### Making yourself an admin

Admins can delete anyone's chat message and see reports. The app can't grant this; you do it
once by hand. Sign up in the app first, then in **SQL Editor** run (with your username):

```sql
update public.profiles set is_admin = true where username = 'your_username';
```

### Notes about Supabase's warnings

Supabase's **Advisors** page may flag two things. Both are on purpose:

- *"RLS enabled, no policy"* on `espn_connections`: no rule means no browser access at all; only the
  server can use that table.
- *"Security definer function executable by authenticated users"* for `is_admin`,
  `my_espn_connection_status`, `delete_my_espn_connection`, `ensure_game_room` and
  `ensure_league_room`: these are the small, safe actions the app is meant to call.

## Never run the test files on Supabase

`tests/local_stub.sql` creates fake versions of Supabase's own sign-in tables and roles, and
`tests/rls_test.sql` creates fake users. **Never paste or run either of them in your Supabase
project.** (The stub has a safety catch that stops if it detects Supabase, but don't rely on it.)

## Running the tests

```bash
bash scripts/test-db.sh
```

It starts a temporary local PostgreSQL 16 database (no Supabase account or internet needed), applies
the stub and every migration, runs the security tests, prints `PASS`, and deletes the temporary
database. It must pass before every commit (see `AGENTS.md`).
