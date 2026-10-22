-- =============================================================================
-- The Feed: database blueprint, part 1 (every table the app starts with).
--
-- How to read this file
--   * Each "create table" makes one table (think: one spreadsheet tab).
--   * Row Level Security (RLS) is switched ON for EVERY table. With RLS on,
--     nobody can see or change a row unless a "policy" below allows it.
--   * "grant" / "revoke" decide which actions (and which columns) each kind of
--     visitor may even attempt. There are three kinds of visitor:
--       anon          = someone using the app without signing in
--       authenticated = a signed-in user (the app in their browser)
--       service_role  = our own server and live-data worker. It uses the secret
--                       key, which never reaches a browser, and skips RLS.
--   * (select auth.uid()) means "the id of the signed-in user making this
--     request". Wrapping it in (select ...) lets Postgres work it out once per
--     request instead of once per row (Supabase's recommended form).
--
-- We grant every permission explicitly instead of relying on Supabase's
-- defaults, so this file says exactly who can do what.
--
-- Apply once, in filename order with any later migrations. See supabase/README.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Shared helper
-- -----------------------------------------------------------------------------

-- Stamps the current time into "updated_at" whenever a row changes.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 1. Profiles: one per user. The public face of an account (name in chat).
-- -----------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  -- 3-24 characters: lowercase letters, digits, underscore.
  username      text not null unique
                constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  -- Only https links, so a picture link can't smuggle in a script.
  avatar_url    text
                constraint profiles_avatar_url_https
                check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)),
  -- ESPN team id (same as teams.id). Not a foreign key, so it works before teams are loaded.
  favorite_team text
                constraint profiles_favorite_team_length
                check (favorite_team is null or char_length(favorite_team) between 1 and 10),
  -- Moderators. Only changeable by the project owner (SQL editor / server), never by the app.
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Second lock on the admin flag (the first lock is the column permissions
-- further down): a signed-in user changing is_admin is refused outright.
create function public.protect_profile_admin_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_admin is distinct from old.is_admin and current_user in ('anon', 'authenticated') then
    raise exception 'Only the project owner can change who is an admin.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_admin_flag
  before update on public.profiles
  for each row execute function public.protect_profile_admin_flag();

-- Creates the profile automatically when someone signs up.
-- "security definer" = runs with the database owner's rights, because the
-- sign-in service has no rights on our tables. The username comes from the
-- sign-in provider's name or the part of the email before "@", cleaned up to
-- the allowed characters; if it's taken, a random number is added.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  avatar    text  := meta ->> 'avatar_url';
  base      text;
  candidate text;
  attempt   int   := 0;
begin
  base := lower(coalesce(
    nullif(meta ->> 'username', ''),
    nullif(meta ->> 'user_name', ''),
    nullif(meta ->> 'preferred_username', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  ));
  base := regexp_replace(base, '[^a-z0-9_]+', '_', 'g');  -- "Jo.Smith" -> "jo_smith"
  base := left(btrim(base, '_'), 18);                     -- room for "_12345" later
  if char_length(base) < 3 then
    base := btrim(left('user_' || base, 18), '_');        -- "ab" -> "user_ab", "" -> "user"
  end if;

  -- Ignore a provider picture unless it's a plain https link.
  if avatar is null or avatar !~ '^https://' or char_length(avatar) > 500 then
    avatar := null;
  end if;

  candidate := base;
  loop
    begin
      insert into public.profiles (id, username, avatar_url)
      values (new.id, candidate, avatar)
      on conflict (id) do nothing;
      return new;
    exception when unique_violation then
      -- Username taken (maybe by someone signing up at the same moment): try another.
      attempt := attempt + 1;
      if attempt > 25 then
        raise;
      elsif attempt > 20 then
        candidate := 'user_' || left(replace(new.id::text, '-', ''), 19);
      else
        candidate := base || '_' || lpad(floor(random() * 100000)::int::text, 5, '0');
      end if;
    end;
  end loop;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True when the signed-in user is an admin. Used inside the chat rules.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
-- Signed-in users can read profiles (names and pictures appear in chat).
grant select on public.profiles to authenticated;
-- ...and edit only these three columns. Not is_admin, not id.
grant update (username, avatar_url, favorite_team) on public.profiles to authenticated;
-- No insert or delete for anyone in the app: the sign-up trigger creates the
-- row, and deleting the account deletes it.

create policy "Signed-in users can read profiles"
  on public.profiles for select to authenticated
  using (true);

create policy "Users can edit only their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 2. Rosters: a user's fantasy team(s). Private to the owner.
-- -----------------------------------------------------------------------------

create table public.rosters (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null
                 constraint rosters_name_length check (char_length(btrim(name)) between 1 and 60),
  source         text not null default 'manual'
                 constraint rosters_source_valid check (source in ('manual', 'espn')),
  scoring_format text not null default 'ppr'
                 constraint rosters_scoring_format_valid check (scoring_format in ('standard', 'half', 'ppr')),
  scoring_json   jsonb,          -- custom scoring rules from an imported ESPN league
  espn_league_id text
                 constraint rosters_espn_league_id_length check (char_length(espn_league_id) between 1 and 32),
  espn_team_id   text
                 constraint rosters_espn_team_id_length check (char_length(espn_team_id) between 1 and 32),
  season         int
                 constraint rosters_season_valid check (season between 2000 and 2100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- An imported ESPN roster must say which league and team it came from.
  constraint rosters_espn_ids_required
    check (source = 'manual' or (espn_league_id is not null and espn_team_id is not null)),
  -- The same ESPN team can't be imported twice for the same season.
  constraint rosters_one_per_espn_team unique (user_id, espn_league_id, espn_team_id, season)
);

-- (The unique constraint above also serves as the index for user_id.)
create index rosters_espn_league_id_idx on public.rosters (espn_league_id);

create trigger rosters_set_updated_at
  before update on public.rosters
  for each row execute function public.set_updated_at();

alter table public.rosters enable row level security;
revoke all on public.rosters from anon, authenticated;
grant select, insert, update, delete on public.rosters to authenticated;

create policy "Owners can read their rosters"
  on public.rosters for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can create rosters for themselves"
  on public.rosters for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners can edit their rosters"
  on public.rosters for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners can delete their rosters"
  on public.rosters for delete to authenticated
  using (user_id = (select auth.uid()));


-- Players on a roster. player_id is ESPN's athlete id. It is deliberately NOT
-- a foreign key to players: a user may add a player before the worker has
-- stored him.
create table public.roster_players (
  roster_id uuid not null references public.rosters (id) on delete cascade,
  player_id text not null
            constraint roster_players_player_id_length check (char_length(player_id) between 1 and 32),
  slot      text not null default 'BENCH'
            constraint roster_players_slot_valid
            check (slot in ('QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST', 'BENCH')),
  position  text
            constraint roster_players_position_length check (char_length(position) <= 10),
  added_at  timestamptz not null default now(),
  primary key (roster_id, player_id)
);

create index roster_players_player_id_idx on public.roster_players (player_id);

alter table public.roster_players enable row level security;
revoke all on public.roster_players from anon, authenticated;
grant select, insert, update, delete on public.roster_players to authenticated;

-- Ownership comes from the parent roster: you can touch a roster's players
-- only if that roster is yours.
create policy "Owners can read their roster players"
  on public.roster_players for select to authenticated
  using (roster_id in (select r.id from public.rosters r where r.user_id = (select auth.uid())));

create policy "Owners can add players to their rosters"
  on public.roster_players for insert to authenticated
  with check (roster_id in (select r.id from public.rosters r where r.user_id = (select auth.uid())));

create policy "Owners can change their roster players"
  on public.roster_players for update to authenticated
  using (roster_id in (select r.id from public.rosters r where r.user_id = (select auth.uid())))
  with check (roster_id in (select r.id from public.rosters r where r.user_id = (select auth.uid())));

create policy "Owners can remove their roster players"
  on public.roster_players for delete to authenticated
  using (roster_id in (select r.id from public.rosters r where r.user_id = (select auth.uid())));


-- -----------------------------------------------------------------------------
-- 3. ESPN connections: a user's ESPN login cookies, encrypted by our server.
--    SERVER ONLY. Never readable from a browser, not even by the owner.
-- -----------------------------------------------------------------------------

create table public.espn_connections (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  encrypted_espn_s2 text not null,
  encrypted_swid    text not null,
  status            text not null default 'active'
                    constraint espn_connections_status_valid check (status in ('active', 'expired', 'error')),
  updated_at        timestamptz not null default now()
);

create trigger espn_connections_set_updated_at
  before update on public.espn_connections
  for each row execute function public.set_updated_at();

-- RLS on with NO policies = no browser access at all. Permissions are also
-- removed, as a second lock. Only the server (service_role) can use this table.
alter table public.espn_connections enable row level security;
revoke all on public.espn_connections from public, anon, authenticated;

-- What the browser may know: "am I connected, and since when?" (never the cookies).
create function public.my_espn_connection_status()
returns table (status text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.status, c.updated_at
  from public.espn_connections c
  where c.user_id = (select auth.uid());
$$;

-- The "Disconnect ESPN" button: deletes the caller's own row, nobody else's.
-- Returns true if there was something to delete.
create function public.delete_my_espn_connection()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.espn_connections
  where user_id = (select auth.uid());
  return found;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. NFL reference and live data. Filled from ESPN by our worker (service_role).
--    Anyone, signed in or not, can read it. Nobody can change it from the app.
--    Player and team ids are ESPN's ids, kept as text. They are not foreign
--    keys, because ESPN can mention a player or team before we've stored it.
-- -----------------------------------------------------------------------------

create table public.teams (
  id              text primary key,         -- ESPN team id
  abbr            text not null unique,     -- e.g. "KC"
  name            text not null,
  short_name      text,
  color_primary   text,                     -- hex colour as ESPN sends it
  color_secondary text,
  logo_url        text,
  updated_at      timestamptz not null default now()
);

create table public.players (
  id            text primary key,           -- ESPN athlete id
  full_name     text not null,
  short_name    text,
  position      text,
  team_id       text,                       -- null for free agents
  jersey        text,
  headshot_url  text,
  status        text,
  injury_status text,
  injury_note   text,
  updated_at    timestamptz not null default now()
);

create index players_team_id_idx on public.players (team_id);

create table public.games (
  id                 text primary key,      -- ESPN event id
  season             int not null,
  season_type        int,                   -- ESPN: 1 preseason, 2 regular, 3 postseason
  week               int,
  kickoff            timestamptz,
  state              text not null default 'pre'
                     constraint games_state_valid check (state in ('pre', 'in', 'post')),
  status_text        text,
  period             int,
  clock              text,
  home_team_id       text,
  away_team_id       text,
  home_score         int,
  away_score         int,
  possession_team_id text,
  down_distance      text,
  yard_line          int,
  is_red_zone        boolean not null default false,
  odds_json          jsonb,
  weather_json       jsonb,
  venue_json         jsonb,
  updated_at         timestamptz not null default now()
);

create index games_season_week_idx on public.games (season, season_type, week);
create index games_kickoff_idx on public.games (kickoff);

-- One row per play. "deleted" marks plays ESPN later removed or replaced.
create table public.plays (
  id                text primary key,       -- ESPN play id
  game_id           text not null references public.games (id) on delete cascade,
  sequence          numeric not null,       -- ESPN's play order
  period            int,
  clock             text,
  text              text,
  play_type         text,
  yards             int,
  team_id           text,
  scoring_play      boolean not null default false,
  score_value       int,
  away_score        int,
  home_score        int,
  participants_json jsonb,
  raw_json          jsonb,
  deleted           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Also serves as the index for the game_id foreign key.
create index plays_game_id_sequence_idx on public.plays (game_id, sequence);

-- Fantasy points each player earned on each play, in all three formats.
create table public.player_play_points (
  play_id           text not null references public.plays (id) on delete cascade,
  player_id         text not null,
  stat_changes_json jsonb not null default '{}'::jsonb,
  standard_pts      numeric(6, 2) not null default 0,
  half_pts          numeric(6, 2) not null default 0,
  ppr_pts           numeric(6, 2) not null default 0,
  primary key (play_id, player_id)
);

create index player_play_points_player_id_idx on public.player_play_points (player_id);

-- Official per-game stat lines and points (these win over play-by-play sums).
create table public.player_game_stats (
  game_id      text not null references public.games (id) on delete cascade,
  player_id    text not null,
  stats_json   jsonb not null default '{}'::jsonb,
  standard_pts numeric(6, 2) not null default 0,
  half_pts     numeric(6, 2) not null default 0,
  ppr_pts      numeric(6, 2) not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index player_game_stats_player_id_idx on public.player_game_stats (player_id);

-- A history of injury status changes ("Questionable" -> "Out").
create table public.injury_events (
  id         uuid primary key default gen_random_uuid(),
  player_id  text not null,
  game_id    text,
  status     text not null,
  note       text,
  source     text,
  created_at timestamptz not null default now()
);

create index injury_events_player_id_created_at_idx on public.injury_events (player_id, created_at desc);
create index injury_events_game_id_idx on public.injury_events (game_id);

create table public.news_items (
  id           text primary key,
  player_id    text,
  headline     text not null,
  description  text,
  link         text,
  published_at timestamptz
);

create index news_items_player_id_published_at_idx on public.news_items (player_id, published_at desc);
create index news_items_published_at_idx on public.news_items (published_at desc);

create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on public.players
  for each row execute function public.set_updated_at();
create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();
create trigger plays_set_updated_at before update on public.plays
  for each row execute function public.set_updated_at();
create trigger player_game_stats_set_updated_at before update on public.player_game_stats
  for each row execute function public.set_updated_at();

-- Same rule for every table in this section: read-only for everyone. There
-- are deliberately no insert/update/delete policies, so only the worker
-- (service_role, which skips RLS) can write.
alter table public.teams              enable row level security;
alter table public.players            enable row level security;
alter table public.games              enable row level security;
alter table public.plays              enable row level security;
alter table public.player_play_points enable row level security;
alter table public.player_game_stats  enable row level security;
alter table public.injury_events      enable row level security;
alter table public.news_items         enable row level security;

revoke all on public.teams, public.players, public.games, public.plays, public.player_play_points,
              public.player_game_stats, public.injury_events, public.news_items
  from anon, authenticated;
grant select on public.teams, public.players, public.games, public.plays, public.player_play_points,
                public.player_game_stats, public.injury_events, public.news_items
  to anon, authenticated;

create policy "Anyone can read teams" on public.teams
  for select to anon, authenticated using (true);
create policy "Anyone can read players" on public.players
  for select to anon, authenticated using (true);
create policy "Anyone can read games" on public.games
  for select to anon, authenticated using (true);
create policy "Anyone can read plays" on public.plays
  for select to anon, authenticated using (true);
create policy "Anyone can read play points" on public.player_play_points
  for select to anon, authenticated using (true);
create policy "Anyone can read game stats" on public.player_game_stats
  for select to anon, authenticated using (true);
create policy "Anyone can read injury events" on public.injury_events
  for select to anon, authenticated using (true);
create policy "Anyone can read news" on public.news_items
  for select to anon, authenticated using (true);


-- -----------------------------------------------------------------------------
-- 5. Chat
-- -----------------------------------------------------------------------------

-- Rooms: one global room, one per game, one per ESPN league.
create table public.chat_rooms (
  id         uuid primary key default gen_random_uuid(),
  type       text not null
             constraint chat_rooms_type_valid check (type in ('global', 'game', 'league')),
  ref_id     text,      -- game rooms: ESPN game id. league rooms: ESPN league id. global: empty.
  title      text
             constraint chat_rooms_title_length check (char_length(title) <= 100),
  created_at timestamptz not null default now(),
  constraint chat_rooms_ref_id_matches_type check ((type = 'global') = (ref_id is null)),
  constraint chat_rooms_type_ref_id_key unique (type, ref_id)
);

-- The unique rule above ignores empty ref_ids, so this makes sure there is only one global room.
create unique index chat_rooms_one_global_room on public.chat_rooms (type) where type = 'global';

insert into public.chat_rooms (type, title) values ('global', 'Global chat');

create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.chat_rooms (id) on delete cascade,
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body           text not null,
  -- For "share this play" cards. A play id but not a foreign key, so plays
  -- from replay data (not stored in our tables) can be shared too.
  shared_play_id text
                 constraint messages_shared_play_id_length check (char_length(shared_play_id) <= 64),
  created_at     timestamptz not null default now(),
  -- Soft delete: the row stays (so live screens learn it was deleted) but the text is wiped.
  deleted        boolean not null default false,
  deleted_by     uuid references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  -- 1-500 characters once leading/trailing spaces are removed (a deleted message is empty).
  constraint messages_body_length
    check (deleted or char_length(btrim(body, E' \t\r\n')) between 1 and 500)
);

create index messages_room_id_created_at_idx on public.messages (room_id, created_at desc);
create index messages_user_id_created_at_idx on public.messages (user_id, created_at desc);
create index messages_deleted_by_idx on public.messages (deleted_by);

-- Runs before every new message:
--   * trims the text and sets the time and delete fields itself (the browser can't fake them);
--   * enforces the rate limit: at most one message per second per person.
-- "security definer" so the rate limit counts all of a user's messages, even
-- in rooms the user can no longer see.
create function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender uuid := coalesce((select auth.uid()), new.user_id);
begin
  new.body       := btrim(new.body, E' \t\r\n');
  new.created_at := now();
  new.deleted    := false;
  new.deleted_by := null;
  new.deleted_at := null;

  -- The lock makes two messages sent at the same instant wait in line, so
  -- the second one sees the first and can't sneak past the limit.
  perform pg_advisory_xact_lock(hashtextextended('messages_rate_limit:' || sender::text, 0));
  if exists (
    select 1 from public.messages m
    where m.user_id = sender
      and m.created_at > now() - interval '1 second'
  ) then
    raise exception 'You''re sending messages too fast. Wait a second and try again.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- Runs before a message is changed: deleting wipes the text and records who
-- deleted it and when. A deleted message can't be brought back.
create function public.messages_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted and not new.deleted then
    raise exception 'A deleted message can''t be restored.' using errcode = '42501';
  end if;
  if new.deleted and not old.deleted then
    new.body       := '';
    new.deleted_at := now();
    new.deleted_by := coalesce((select auth.uid()), new.deleted_by);
  end if;
  return new;
end;
$$;

create trigger messages_before_update
  before update on public.messages
  for each row execute function public.messages_before_update();

-- Emoji reactions, from a short fixed list.
create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji      text not null
             constraint message_reactions_emoji_allowed
             check (emoji in ('🔥', '😂', '😭', '💀', '👏', '🏈')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index message_reactions_user_id_idx on public.message_reactions (user_id);

-- "Report this message". Admins review them.
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason       text
               constraint reports_reason_length check (char_length(reason) <= 500),
  -- Copy of the message text when it was reported (filled in by the
  -- database), so admins can still read it after the message is deleted.
  message_body text,
  created_at   timestamptz not null default now(),
  constraint reports_one_per_person unique (message_id, reporter_id)
);

create index reports_reporter_id_idx on public.reports (reporter_id);

create function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at   := now();
  new.message_body := (select m.body from public.messages m where m.id = new.message_id);
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

-- "Block this user": you stop seeing their messages.
create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);


-- Chat permissions. Chat is for signed-in users only: anon gets nothing.
alter table public.chat_rooms        enable row level security;
alter table public.messages          enable row level security;
alter table public.message_reactions enable row level security;
alter table public.reports           enable row level security;
alter table public.user_blocks       enable row level security;

revoke all on public.chat_rooms, public.messages, public.message_reactions, public.reports, public.user_blocks
  from anon, authenticated;

-- Rooms are created only through ensure_game_room() / ensure_league_room() below.
grant select on public.chat_rooms to authenticated;
-- Messages: post (these columns only) and soft-delete. Text can never be edited.
grant select on public.messages to authenticated;
grant insert (room_id, user_id, body, shared_play_id) on public.messages to authenticated;
grant update (deleted) on public.messages to authenticated;
grant select, delete on public.message_reactions to authenticated;
grant insert (message_id, user_id, emoji) on public.message_reactions to authenticated;
grant select, delete on public.reports to authenticated;
grant insert (message_id, reporter_id, reason) on public.reports to authenticated;
grant select, delete on public.user_blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.user_blocks to authenticated;

-- Rooms: global and game rooms are open to every signed-in user. A league
-- room is open only to users with a roster in that ESPN league. Admins see
-- every room so they can moderate.
create policy "Signed-in users can see rooms they belong to"
  on public.chat_rooms for select to authenticated
  using (
    type in ('global', 'game')
    or (type = 'league' and ref_id in (
          select r.espn_league_id from public.rosters r where r.user_id = (select auth.uid())))
    or (select public.is_admin())
  );

-- Messages: visible if you can see the room (the room rule above decides)
-- and you haven't blocked the sender.
create policy "Read messages in your rooms, except from people you blocked"
  on public.messages for select to authenticated
  using (
    room_id in (select cr.id from public.chat_rooms cr)
    and user_id not in (
      select b.blocked_id from public.user_blocks b where b.blocker_id = (select auth.uid()))
  );

-- Post only as yourself, only in rooms you can see.
create policy "Post as yourself in your rooms"
  on public.messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and room_id in (select cr.id from public.chat_rooms cr)
  );

-- Soft-delete: your own messages, or any message if you're an admin.
-- The only change allowed is deleted = true.
create policy "Delete your own messages, admins can delete any"
  on public.messages for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (deleted);

create policy "See reactions on messages you can see"
  on public.message_reactions for select to authenticated
  using (message_id in (select m.id from public.messages m));

create policy "React as yourself to messages you can see"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and message_id in (select m.id from public.messages m where not m.deleted)
  );

create policy "Remove your own reactions"
  on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Report messages you can see, as yourself"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and message_id in (select m.id from public.messages m)
  );

-- Reports stay private: reporters see their own, admins see all.
create policy "Reporters see their reports, admins see all"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

create policy "Admins can dismiss reports"
  on public.reports for delete to authenticated
  using ((select public.is_admin()));

-- Your block list is private to you.
create policy "See your own blocks"
  on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Block as yourself"
  on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "Unblock your own blocks"
  on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));


-- Returns the chat room for a game, creating it the first time anyone opens it.
-- Safe to call any number of times: always the same room.
create function public.ensure_game_room(game_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_id    uuid;
  room_title text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to use game chat.' using errcode = '42501';
  end if;
  if game_id is null or game_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'Not a valid game id.' using errcode = '22023';
  end if;

  -- "AWAY @ HOME", if the worker has stored the game and teams already.
  select away.abbr || ' @ ' || home.abbr
    into room_title
    from public.games g
    join public.teams home on home.id = g.home_team_id
    join public.teams away on away.id = g.away_team_id
   where g.id = ensure_game_room.game_id;

  insert into public.chat_rooms (type, ref_id, title)
  values ('game', ensure_game_room.game_id, room_title)
  on conflict (type, ref_id) do nothing
  returning id into room_id;

  if room_id is null then
    select cr.id into room_id
      from public.chat_rooms cr
     where cr.type = 'game' and cr.ref_id = ensure_game_room.game_id;
  end if;
  return room_id;
end;
$$;

-- Same for an ESPN league's room, but only for users with a roster in that league.
create function public.ensure_league_room(league_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_id uuid;
begin
  if not exists (
    select 1 from public.rosters r
    where r.user_id = (select auth.uid())
      and r.espn_league_id = ensure_league_room.league_id
  ) then
    raise exception 'Only members of this league can open its chat.' using errcode = '42501';
  end if;

  insert into public.chat_rooms (type, ref_id)
  values ('league', ensure_league_room.league_id)
  on conflict (type, ref_id) do nothing
  returning id into room_id;

  if room_id is null then
    select cr.id into room_id
      from public.chat_rooms cr
     where cr.type = 'league' and cr.ref_id = ensure_league_room.league_id;
  end if;
  return room_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. Who may call which function
-- -----------------------------------------------------------------------------

-- Trigger helpers: the database runs them itself; nobody calls them directly.
revoke all on function public.set_updated_at()             from public, anon, authenticated;
revoke all on function public.protect_profile_admin_flag() from public, anon, authenticated;
revoke all on function public.handle_new_user()            from public, anon, authenticated;
revoke all on function public.messages_before_insert()     from public, anon, authenticated;
revoke all on function public.messages_before_update()     from public, anon, authenticated;
revoke all on function public.reports_before_insert()      from public, anon, authenticated;

-- Signed-in users (and the server) only. Signed-out visitors can't call these.
revoke all on function public.is_admin()                   from public, anon;
revoke all on function public.my_espn_connection_status()  from public, anon;
revoke all on function public.delete_my_espn_connection()  from public, anon;
revoke all on function public.ensure_game_room(text)       from public, anon;
revoke all on function public.ensure_league_room(text)     from public, anon;
grant execute on function public.is_admin()                  to authenticated, service_role;
grant execute on function public.my_espn_connection_status() to authenticated, service_role;
grant execute on function public.delete_my_espn_connection() to authenticated, service_role;
grant execute on function public.ensure_game_room(text)      to authenticated, service_role;
grant execute on function public.ensure_league_room(text)    to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 7. The server's access
-- -----------------------------------------------------------------------------

-- The server and worker (service_role) can read and write every table. They
-- skip RLS, so this table permission is all they need.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;


-- -----------------------------------------------------------------------------
-- 8. Live updates (Supabase Realtime)
-- -----------------------------------------------------------------------------

-- Lets the app hear about changes to these tables the moment they happen.
-- RLS still applies: each listener only hears about rows they could read.
-- Written defensively so it never fails: skipped if Realtime isn't set up,
-- and tables already added are left alone.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Realtime publication not found; skipping live-update setup.';
    return;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise notice 'Realtime already covers all tables; nothing to add.';
    return;
  end if;
  foreach t in array array[
    'games', 'plays', 'player_play_points', 'player_game_stats',
    'injury_events', 'messages', 'message_reactions'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
