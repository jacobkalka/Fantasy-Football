-- =============================================================================
-- FantasyLab: database blueprint, part 2 (the community chat and public profiles).
--
-- Adds, on top of part 1 (20261022000000_init.sql):
--   * channels: General (the old global room), Start / Sit, Trades, Waivers,
--     Player Talk, Matchups, plus one room per player on demand;
--   * replies (a message answering another) and threads (a conversation
--     hanging off one message, kept out of the main channel);
--   * a curated set of reactions, with a rate limit;
--   * polls, with one vote per person (changeable);
--   * read state per person and channel, for unread counts;
--   * mutes (quieter than a block);
--   * public profiles and the fantasy teams people CHOOSE to show.
--
-- Same rules as part 1: RLS on every table, every permission granted
-- explicitly, every function with a fixed search_path, an index on every
-- foreign key. Apply after part 1. See supabase/README.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Channels
-- -----------------------------------------------------------------------------

alter table public.chat_rooms drop constraint chat_rooms_type_valid;
alter table public.chat_rooms add constraint chat_rooms_type_valid
  check (type in ('global', 'game', 'league', 'channel', 'player'));

-- Channels (like the global room) have no ref_id; game, league and player rooms do.
alter table public.chat_rooms drop constraint chat_rooms_ref_id_matches_type;
alter table public.chat_rooms add constraint chat_rooms_ref_id_matches_type
  check ((type in ('global', 'channel')) = (ref_id is null));

alter table public.chat_rooms
  add column slug            text
             constraint chat_rooms_slug_format check (slug is null or slug ~ '^[a-z0-9-]{2,40}$'),
  add column description     text
             constraint chat_rooms_description_length check (description is null or char_length(description) <= 200),
  add column sort_order      int not null default 100,
  -- Kept up to date by a trigger on messages: lets the channel list sort by activity.
  add column last_message_at timestamptz;

create unique index chat_rooms_slug_key on public.chat_rooms (slug) where slug is not null;

-- The global room becomes General.
update public.chat_rooms
   set slug = 'general', title = 'General', sort_order = 0,
       description = 'The whole FantasyLab community: news, hot takes, predictions, anything fantasy.'
 where type = 'global';

insert into public.chat_rooms (type, slug, title, description, sort_order) values
  ('channel', 'start-sit',   'Start / Sit', 'Who should I start? Lineup, flex and injury calls.',             10),
  ('channel', 'trades',      'Trades',      'Is this trade fair? Buy-low, sell-high and trade targets.',      20),
  ('channel', 'waivers',     'Waivers',     'Pickups, sleepers, breakouts and injury replacements.',          30),
  ('channel', 'player-talk', 'Player Talk', 'Talk about any player. Each player also has a room of his own.',  40),
  ('channel', 'matchups',    'Matchups',    'This week''s matchups, close calls and playoff races.',           50);

-- Who sees which room: everything except league rooms is open to every
-- signed-in user. League rooms stay members-only; admins see every room.
drop policy "Signed-in users can see rooms they belong to" on public.chat_rooms;
create policy "Signed-in users can see rooms they belong to"
  on public.chat_rooms for select to authenticated
  using (
    type in ('global', 'game', 'channel', 'player')
    or (type = 'league' and ref_id in (
          select r.espn_league_id from public.rosters r where r.user_id = (select auth.uid())))
    or (select public.is_admin())
  );

-- A player's own room (Player Talk), created the first time anyone opens it.
-- The title is only set at creation and only from a plain name; the app shows
-- the name from its own player data anyway.
create function public.ensure_player_room(player_id text, player_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_id uuid;
  clean   text := btrim(coalesce(player_name, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to use chat.' using errcode = '42501';
  end if;
  if player_id is null or player_id !~ '^-?[0-9]{1,12}$' then
    raise exception 'Not a valid player id.' using errcode = '22023';
  end if;
  if clean !~ '^[A-Za-z0-9 .''/-]{1,60}$' then
    clean := null;
  end if;

  insert into public.chat_rooms (type, ref_id, title)
  values ('player', ensure_player_room.player_id, clean)
  on conflict (type, ref_id) do nothing
  returning id into room_id;

  if room_id is null then
    select cr.id into room_id from public.chat_rooms cr
     where cr.type = 'player' and cr.ref_id = ensure_player_room.player_id;
  end if;
  return room_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. Messages: replies, threads and attachments
-- -----------------------------------------------------------------------------

alter table public.messages
  -- "Replying to": shown in the main channel with a quote of the original.
  add column reply_to             uuid references public.messages (id) on delete set null,
  -- Thread replies hang off one message (the root) and stay out of the main channel.
  add column thread_id            uuid references public.messages (id) on delete cascade,
  -- Rich parts the author chose to attach: players, a game, a trade card, a poll.
  add column attachments          jsonb
             constraint messages_attachments_shape check (
               attachments is null
               or (jsonb_typeof(attachments) = 'object'
                   and pg_column_size(attachments) <= 4000
                   and (attachments - array['players', 'game', 'trade', 'poll']) = '{}'::jsonb)),
  -- Kept by the database (never by the app): how many replies a thread root has.
  add column thread_reply_count   int not null default 0,
  add column last_thread_reply_at timestamptz;

create index messages_reply_to_idx on public.messages (reply_to);
create index messages_thread_id_created_at_idx on public.messages (thread_id, created_at);

-- Replaces part 1's version: the same trimming, stamping and 1-per-second limit,
-- plus a flood limit (20 in a minute), and checks that a reply or thread reply
-- belongs to the same room (and that threads don't nest).
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender uuid := coalesce((select auth.uid()), new.user_id);
  parent record;
begin
  new.body                 := btrim(new.body, E' \t\r\n');
  new.created_at           := now();
  new.deleted              := false;
  new.deleted_by           := null;
  new.deleted_at           := null;
  new.thread_reply_count   := 0;
  new.last_thread_reply_at := null;

  if new.thread_id is not null then
    select m.room_id, m.thread_id, m.deleted into parent from public.messages m where m.id = new.thread_id;
    if parent is null or parent.room_id <> new.room_id or parent.thread_id is not null then
      raise exception 'That thread isn''t in this channel.' using errcode = '22023';
    end if;
  end if;
  if new.reply_to is not null then
    select m.room_id into parent from public.messages m where m.id = new.reply_to;
    if parent is null or parent.room_id <> new.room_id then
      raise exception 'You can only reply to a message in the same channel.' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('messages_rate_limit:' || sender::text, 0));
  if exists (
    select 1 from public.messages m
    where m.user_id = sender
      and m.created_at > now() - interval '1 second'
  ) then
    raise exception 'You''re sending messages too fast. Wait a second and try again.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if (select count(*) from public.messages m
      where m.user_id = sender and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'That''s a lot of messages in a minute. Take a breather and try again shortly.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  return new;
end;
$$;

-- After a message: bump its thread's reply count and the room's activity time.
create function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.thread_id is not null then
    update public.messages
       set thread_reply_count = thread_reply_count + 1,
           last_thread_reply_at = new.created_at
     where id = new.thread_id;
  end if;
  update public.chat_rooms set last_message_at = new.created_at where id = new.room_id;
  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

grant insert (room_id, user_id, body, shared_play_id, reply_to, thread_id, attachments) on public.messages to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Reactions: a curated set, rate limited
-- -----------------------------------------------------------------------------

alter table public.message_reactions drop constraint message_reactions_emoji_allowed;
alter table public.message_reactions add constraint message_reactions_emoji_allowed
  check (emoji in ('❤️', '🔥', '😂', '👀', '👍', '💀', '🏈', '😭', '👏'));

-- Stops reaction spam (and scripted "manipulation"): 40 a minute per person.
create function public.message_reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  if (select count(*) from public.message_reactions r
      where r.user_id = coalesce((select auth.uid()), new.user_id)
        and r.created_at > now() - interval '1 minute') >= 40 then
    raise exception 'Too many reactions in a minute. Try again shortly.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;

create trigger message_reactions_before_insert
  before insert on public.message_reactions
  for each row execute function public.message_reactions_before_insert();


-- -----------------------------------------------------------------------------
-- 4. Polls
-- -----------------------------------------------------------------------------

-- 2-6 options of 1-60 characters each. (A check can't loop, so it calls this.)
create function public.poll_options_valid(options text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(options, 1), 0) between 2 and 6
     and not exists (select 1 from unnest(options) o where char_length(btrim(o)) not between 1 and 60);
$$;

create table public.chat_polls (
  -- The message that carries the poll (its author is the poll's author).
  message_id uuid primary key references public.messages (id) on delete cascade,
  question   text not null
             constraint chat_polls_question_length check (char_length(btrim(question)) between 1 and 140),
  options    text[] not null
             constraint chat_polls_options_valid check (public.poll_options_valid(options)),
  closes_at  timestamptz,
  created_at timestamptz not null default now()
);

create table public.chat_poll_votes (
  message_id   uuid not null references public.chat_polls (message_id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  option_index smallint not null constraint chat_poll_votes_option_index check (option_index >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index chat_poll_votes_user_id_idx on public.chat_poll_votes (user_id);

create trigger chat_poll_votes_set_updated_at
  before update on public.chat_poll_votes
  for each row execute function public.set_updated_at();

-- A vote must name a real option, and closed polls take no more votes.
create function public.chat_poll_votes_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll record;
begin
  select p.options, p.closes_at into poll from public.chat_polls p where p.message_id = new.message_id;
  if poll is null or new.option_index >= array_length(poll.options, 1) then
    raise exception 'That isn''t one of the poll''s options.' using errcode = '22023';
  end if;
  if poll.closes_at is not null and poll.closes_at < now() then
    raise exception 'This poll has closed.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger chat_poll_votes_check
  before insert or update on public.chat_poll_votes
  for each row execute function public.chat_poll_votes_check();


-- -----------------------------------------------------------------------------
-- 5. Read state (unread counts) and mutes
-- -----------------------------------------------------------------------------

create table public.chat_read_state (
  user_id              uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  room_id              uuid not null references public.chat_rooms (id) on delete cascade,
  last_read_at         timestamptz not null default now(),
  last_read_message_id uuid references public.messages (id) on delete set null,
  updated_at           timestamptz not null default now(),
  primary key (user_id, room_id)
);

create index chat_read_state_room_id_idx on public.chat_read_state (room_id);
create index chat_read_state_last_read_message_id_idx on public.chat_read_state (last_read_message_id);

create trigger chat_read_state_set_updated_at
  before update on public.chat_read_state
  for each row execute function public.set_updated_at();

-- "Mute": their messages fold away and don't count as unread. Private to you, like blocks.
create table public.user_mutes (
  muter_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  muted_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  constraint user_mutes_not_self check (muter_id <> muted_id)
);

create index user_mutes_muted_id_idx on public.user_mutes (muted_id);

-- Unread messages per room for the signed-in user. Runs with the caller's rights,
-- so row-level security decides what counts (rooms you can see, no blocked people).
-- Thread replies, your own messages, deleted and muted people don't count. A room
-- you've never opened counts its last 3 days.
create function public.my_unread_counts()
returns table (room_id uuid, unread bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.room_id, count(*)::bigint
    from public.messages m
    left join public.chat_read_state r
           on r.room_id = m.room_id and r.user_id = (select auth.uid())
   where m.thread_id is null
     and not m.deleted
     and m.user_id <> (select auth.uid())
     and m.created_at > coalesce(r.last_read_at, now() - interval '3 days')
     and m.user_id not in (select mu.muted_id from public.user_mutes mu where mu.muter_id = (select auth.uid()))
   group by m.room_id;
$$;


-- -----------------------------------------------------------------------------
-- 6. Public profiles and the teams people choose to show
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column display_name    text
             constraint profiles_display_name_length check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  add column bio             text
             constraint profiles_bio_length check (bio is null or char_length(bio) <= 160),
  -- Off = only your username and picture show (in chat); no profile page details or teams.
  add column is_public       boolean not null default true,
  add column primary_team_id uuid;

-- A snapshot of one of your teams that YOU published. Only what you chose is ever
-- stored: no roster unless you share the roster, no league name unless you share
-- it, and never anything from your ESPN login. Deleting it removes it everywhere.
create table public.public_teams (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The team's id on the device that published it ("t_ab12cd34"), so republishing updates it.
  local_id      text not null constraint public_teams_local_id_format check (local_id ~ '^t_[a-z0-9]{4,24}$'),
  name          text not null constraint public_teams_name_length check (char_length(btrim(name)) between 1 and 60),
  logo_url      text constraint public_teams_logo_https
                check (logo_url is null or (logo_url ~ '^https://[a-z0-9.-]*espncdn\.com/' and char_length(logo_url) <= 500)),
  source        text not null default 'manual' constraint public_teams_source_valid check (source in ('manual', 'espn')),
  league_name   text constraint public_teams_league_name_length check (league_name is null or char_length(league_name) <= 80),
  season        int constraint public_teams_season_valid check (season is null or season between 2000 and 2100),
  record        text constraint public_teams_record_format check (record is null or record ~ '^[0-9]{1,2}-[0-9]{1,2}(-[0-9]{1,2})?$'),
  scoring_label text constraint public_teams_scoring_label_length check (scoring_label is null or char_length(scoring_label) <= 40),
  -- [{ "id", "name", "position", "teamId", "slot" }], at most 20 players. Null = roster not shared.
  roster        jsonb constraint public_teams_roster_shape
                check (roster is null or (jsonb_typeof(roster) = 'array' and jsonb_array_length(roster) <= 20 and pg_column_size(roster) <= 8000)),
  -- { "week", "opponent", "points", "opponentPoints" }. Null = matchup not shared.
  matchup       jsonb constraint public_teams_matchup_shape
                check (matchup is null or (jsonb_typeof(matchup) = 'object' and pg_column_size(matchup) <= 1000)),
  is_visible    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint public_teams_one_per_local_team unique (user_id, local_id)
);

create trigger public_teams_set_updated_at
  before update on public.public_teams
  for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_primary_team_id_fkey
  foreign key (primary_team_id) references public.public_teams (id) on delete set null;
create index profiles_primary_team_id_idx on public.profiles (primary_team_id);

-- Your primary team must be one of your own.
create function public.profiles_check_primary_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.primary_team_id is not null and not exists (
    select 1 from public.public_teams t where t.id = new.primary_team_id and t.user_id = new.id
  ) then
    raise exception 'Your primary team has to be one of your own.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_check_primary_team
  before insert or update of primary_team_id on public.profiles
  for each row execute function public.profiles_check_primary_team();


-- -----------------------------------------------------------------------------
-- 7. Permissions and rules
-- -----------------------------------------------------------------------------

alter table public.chat_polls      enable row level security;
alter table public.chat_poll_votes enable row level security;
alter table public.chat_read_state enable row level security;
alter table public.user_mutes      enable row level security;
alter table public.public_teams    enable row level security;

revoke all on public.chat_polls, public.chat_poll_votes, public.chat_read_state, public.user_mutes, public.public_teams
  from anon, authenticated;

grant select on public.chat_polls to authenticated;
grant insert (message_id, question, options, closes_at) on public.chat_polls to authenticated;
grant select, delete on public.chat_poll_votes to authenticated;
grant insert (message_id, user_id, option_index) on public.chat_poll_votes to authenticated;
grant update (option_index) on public.chat_poll_votes to authenticated;
grant select, delete on public.chat_read_state to authenticated;
grant insert (user_id, room_id, last_read_at, last_read_message_id) on public.chat_read_state to authenticated;
grant update (last_read_at, last_read_message_id) on public.chat_read_state to authenticated;
grant select, delete on public.user_mutes to authenticated;
grant insert (muter_id, muted_id) on public.user_mutes to authenticated;
grant select, delete on public.public_teams to authenticated;
grant insert (user_id, local_id, name, logo_url, source, league_name, season, record, scoring_label, roster, matchup, is_visible)
  on public.public_teams to authenticated;
grant update (name, logo_url, source, league_name, season, record, scoring_label, roster, matchup, is_visible)
  on public.public_teams to authenticated;
grant update (username, avatar_url, favorite_team, display_name, bio, is_public, primary_team_id) on public.profiles to authenticated;

-- Polls: visible with their message. Only the message's author can attach a poll,
-- within two minutes of posting it, to a message marked as a poll.
create policy "See polls on messages you can see"
  on public.chat_polls for select to authenticated
  using (message_id in (select m.id from public.messages m));

create policy "Authors attach a poll to their own new message"
  on public.chat_polls for insert to authenticated
  with check (
    message_id in (
      select m.id from public.messages m
       where m.user_id = (select auth.uid())
         and m.created_at > now() - interval '2 minutes'
         and m.attachments ? 'poll')
  );

create policy "See votes on polls you can see"
  on public.chat_poll_votes for select to authenticated
  using (message_id in (select p.message_id from public.chat_polls p));

create policy "Vote as yourself"
  on public.chat_poll_votes for insert to authenticated
  with check (user_id = (select auth.uid()) and message_id in (select p.message_id from public.chat_polls p));

create policy "Change your own vote"
  on public.chat_poll_votes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Take back your own vote"
  on public.chat_poll_votes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Read state and mutes are private to their owner.
create policy "Your own read state"
  on public.chat_read_state for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Mark rooms you can see as read"
  on public.chat_read_state for insert to authenticated
  with check (user_id = (select auth.uid()) and room_id in (select cr.id from public.chat_rooms cr));
create policy "Update your own read state"
  on public.chat_read_state for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Clear your own read state"
  on public.chat_read_state for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "See your own mutes"
  on public.user_mutes for select to authenticated
  using (muter_id = (select auth.uid()));
create policy "Mute as yourself"
  on public.user_mutes for insert to authenticated
  with check (muter_id = (select auth.uid()));
create policy "Unmute your own mutes"
  on public.user_mutes for delete to authenticated
  using (muter_id = (select auth.uid()));

-- Public teams: yours always; other people's only if they're visible and their
-- profile is public.
create policy "See your teams and other people's public teams"
  on public.public_teams for select to authenticated
  using (
    user_id = (select auth.uid())
    or (is_visible and user_id in (select p.id from public.profiles p where p.is_public))
  );
create policy "Publish your own teams"
  on public.public_teams for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Edit your own public teams"
  on public.public_teams for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Remove your own public teams"
  on public.public_teams for delete to authenticated
  using (user_id = (select auth.uid()));

-- Functions: triggers are the database's own; the rest are for signed-in users.
revoke all on function public.messages_after_insert()            from public, anon, authenticated;
revoke all on function public.message_reactions_before_insert()  from public, anon, authenticated;
revoke all on function public.chat_poll_votes_check()            from public, anon, authenticated;
revoke all on function public.profiles_check_primary_team()      from public, anon, authenticated;
revoke all on function public.ensure_player_room(text, text)     from public, anon;
revoke all on function public.my_unread_counts()                 from public, anon;
grant execute on function public.ensure_player_room(text, text)  to authenticated, service_role;
grant execute on function public.my_unread_counts()              to authenticated, service_role;
grant execute on function public.poll_options_valid(text[])      to authenticated, service_role;

grant all on public.chat_polls, public.chat_poll_votes, public.chat_read_state, public.user_mutes, public.public_teams
  to service_role;


-- -----------------------------------------------------------------------------
-- 8. Live updates
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Realtime publication not found; skipping live-update setup.';
    return;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    return;
  end if;
  foreach t in array array['chat_poll_votes', 'chat_rooms'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- 9. League rooms need a VERIFIED league membership
-- -----------------------------------------------------------------------------
-- Part 1 let anyone with a roster row naming a league into its chat room, and
-- anyone can write such a row. Now the server marks a roster "verified" only
-- after it has read the league from ESPN with that user's own login and found
-- the user among the league's members (app/api/espn/verify-league). Only the
-- server can set the flag; league rooms and their messages need it.

alter table public.rosters add column espn_verified boolean not null default false;

create function public.protect_roster_verified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.espn_verified then
      raise exception 'Only the server can verify a league membership.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.espn_verified is distinct from old.espn_verified then
      raise exception 'Only the server can verify a league membership.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger rosters_protect_verified
  before insert or update on public.rosters
  for each row execute function public.protect_roster_verified();

revoke all on function public.protect_roster_verified() from public, anon, authenticated;

drop policy "Signed-in users can see rooms they belong to" on public.chat_rooms;
create policy "Signed-in users can see rooms they belong to"
  on public.chat_rooms for select to authenticated
  using (
    type in ('global', 'game', 'channel', 'player')
    or (type = 'league' and ref_id in (
          select r.espn_league_id from public.rosters r
           where r.user_id = (select auth.uid()) and r.espn_verified))
    or (select public.is_admin())
  );

create or replace function public.ensure_league_room(league_id text)
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
      and r.espn_verified
  ) then
    raise exception 'Only verified members of this league can open its chat.' using errcode = '42501';
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
-- 10. A private profile keeps its bio and primary team private
-- -----------------------------------------------------------------------------
-- Usernames, pictures and display names show in chat, so everyone signed in can
-- read them. The bio and the primary team belong to the profile page: they come
-- only from public_profile(), which returns them when the profile is public (or
-- it's your own).

revoke select on public.profiles from authenticated;
grant select (id, username, avatar_url, favorite_team, is_admin, display_name, is_public, created_at, updated_at)
  on public.profiles to authenticated;

create function public.public_profile(name text)
returns table (
  id uuid, username text, avatar_url text, display_name text, bio text,
  is_public boolean, primary_team_id uuid, is_admin boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.avatar_url, p.display_name,
         case when p.is_public or p.id = (select auth.uid()) then p.bio end,
         p.is_public,
         case when p.is_public or p.id = (select auth.uid()) then p.primary_team_id end,
         p.is_admin, p.created_at
    from public.profiles p
   where (select auth.uid()) is not null
     and p.username = lower(btrim(public_profile.name));
$$;

revoke all on function public.public_profile(text) from public, anon;
grant execute on function public.public_profile(text) to authenticated, service_role;
