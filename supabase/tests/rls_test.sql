-- =============================================================================
-- Database security tests.
--
-- Run by scripts/test-db.sh on a throwaway local database, after
-- tests/local_stub.sql and every migration. It signs in as different test
-- users and tries to do things the rules should allow or refuse. Each check
-- prints "ok - ..." or stops everything with "FAIL: ...".
--
-- Never run this against a real Supabase project: it creates fake users.
-- =============================================================================

\set QUIET 1
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

-- -----------------------------------------------------------------------------
-- Test helpers. They live in a separate "test" schema that only exists here.
-- -----------------------------------------------------------------------------
create schema test;
grant usage on schema test to public;

create sequence test.checks;               -- counts the checks that ran
grant usage on sequence test.checks to public;

create table test.people (name text primary key, id uuid not null unique);
grant select on test.people to public;
insert into test.people (name, id) values
  ('alice', 'a11ce000-0000-4000-8000-000000000001'),
  ('bob',   'b0b00000-0000-4000-8000-000000000002'),
  ('carol', 'ca201000-0000-4000-8000-000000000003'),   -- will be an admin
  ('dave',  'da7e0000-0000-4000-8000-000000000004'),
  ('erin',  'e2140000-0000-4000-8000-000000000005');

create function test.id(who text) returns uuid
language sql stable
as $$ select p.id from test.people p where p.name = who $$;

-- Act as a signed-in user until the end of the current transaction, exactly
-- the way Supabase's API does for a request from the app.
create function test.login(who text) returns text
language plpgsql
as $$
declare
  uid uuid := test.id(who);
begin
  if uid is null then
    raise exception 'unknown test user %', who;
  end if;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  return format('  [as %s]', who);
end;
$$;

-- Act as a signed-out visitor until the end of the current transaction.
create function test.login_anon() returns text
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('role', 'anon', true);
  return '  [as a signed-out visitor]';
end;
$$;

-- Passes if the condition is true.
create function test.check(passed boolean, label text) returns text
language plpgsql
as $$
begin
  perform nextval('test.checks');
  if passed is not true then
    raise exception 'FAIL: %', label;
  end if;
  return '  ok - ' || label;
end;
$$;

-- Runs a statement that MUST be refused. Passes only if it fails, with the
-- expected error code when one is given (42501 = not allowed,
-- 23514 = breaks a data rule, 23505 = duplicate, P0001 = custom error).
create function test.fails(statement text, label text, expected_code text default null) returns text
language plpgsql
as $$
begin
  perform nextval('test.checks');
  begin
    execute statement;
  exception when others then
    if expected_code is not null and sqlstate <> expected_code then
      raise exception 'FAIL: % (expected error %, got %: %)', label, expected_code, sqlstate, sqlerrm;
    end if;
    return format('  ok - %s  [refused: %s]', label, sqlerrm);
  end;
  raise exception 'FAIL: % (it was allowed, but should have been refused)', label;
end;
$$;

-- Runs a statement and returns how many rows it changed.
create function test.rows(statement text) returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Looks up a room id, ignoring the security rules (only for setting up tests).
create function test.room(room_type text, ref text default null) returns uuid
language sql stable security definer set search_path = ''
as $$
  select cr.id from public.chat_rooms cr
  where cr.type = room_type and cr.ref_id is not distinct from ref
$$;

create function test.pause() returns text
language sql
as $$
  select pg_sleep(1.1);
  select '  [waiting 1 second for the chat rate limit]';
$$;


-- -----------------------------------------------------------------------------
\echo '1. Signing up creates a profile automatically'
-- -----------------------------------------------------------------------------
-- Insert the users the way Supabase's sign-in service does: as a role with no
-- special rights on our tables.
begin;
set local role local_auth_admin;
insert into auth.users (id, email, raw_user_meta_data) values
  (test.id('alice'), 'alice@example.com',       '{"username": "Alice"}'),
  (test.id('bob'),   'bob@example.com',         '{}'),
  (test.id('carol'), 'carol.admin@example.com', '{"avatar_url": "javascript:alert(1)"}'),
  (test.id('dave'),  'alice@example.org',       '{}'),
  (test.id('erin'),  'e@example.com',           '{"username": "!!"}');
commit;

select test.check((select count(*) from public.profiles) = 5,
  'every new user got a profile');
select test.check((select username from public.profiles where id = test.id('alice')) = 'alice',
  'username comes from sign-up data, lowercased (Alice -> alice)');
select test.check((select username from public.profiles where id = test.id('bob')) = 'bob',
  'otherwise it comes from the email (bob@... -> bob)');
select test.check((select username from public.profiles where id = test.id('carol')) = 'carol_admin',
  'odd characters become _ (carol.admin -> carol_admin)');
select test.check((select avatar_url from public.profiles where id = test.id('carol')) is null,
  'a non-https picture link from sign-up is ignored');
select test.check((select username from public.profiles where id = test.id('dave')) ~ '^alice_[0-9]{5}$',
  'a taken username gets a number added (alice -> alice_12345)');
select test.check((select username from public.profiles where id = test.id('erin')) = 'user',
  'an unusable name falls back to "user"');

-- The project owner makes Carol an admin (in real life: in the Supabase SQL editor).
update public.profiles set is_admin = true where id = test.id('carol');


-- -----------------------------------------------------------------------------
\echo '2. The server (service role) writes NFL data and ESPN connections'
-- -----------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.teams (id, abbr, name) values
  ('901', 'HOM', 'Test Home Team'),
  ('902', 'AWY', 'Test Away Team');
insert into public.games (id, season, season_type, week, state, home_team_id, away_team_id)
  values ('7001', 2026, 2, 7, 'in', '901', '902');
insert into public.plays (id, game_id, sequence, text) values ('70010001', '7001', 1, 'Test play');
insert into public.player_play_points (play_id, player_id, ppr_pts) values ('70010001', '5001', 1.5);
insert into public.espn_connections (user_id, encrypted_espn_s2, encrypted_swid) values
  (test.id('alice'), 'encrypted-a', 'encrypted-a'),
  (test.id('bob'),   'encrypted-b', 'encrypted-b');
select test.check(test.rows($$update public.games set home_score = 7 where id = '7001'$$) = 1,
  'the server can update live game data');
select test.check((select count(*) from public.espn_connections) = 2,
  'the server can read and write ESPN connections');
commit;


-- -----------------------------------------------------------------------------
\echo '3. Signed-out visitors can read NFL data and nothing else'
-- -----------------------------------------------------------------------------
begin;
select test.login_anon();
select test.check((select count(*) from public.teams) = 2, 'can read teams');
select test.check((select count(*) from public.games) = 1, 'can read games');
select test.check((select count(*) from public.plays) = 1, 'can read plays');
select test.check((select count(*) from public.player_play_points) = 1, 'can read play points');
select test.fails($$insert into public.teams (id, abbr, name) values ('999', 'ZZZ', 'Fake')$$,
  'cannot add a team', '42501');
select test.fails($$update public.games set home_score = 99$$,
  'cannot change a score', '42501');
select test.fails($$delete from public.plays$$,
  'cannot delete plays', '42501');
select test.fails($$select * from public.profiles$$,
  'cannot read profiles', '42501');
select test.fails($$select * from public.rosters$$,
  'cannot read rosters', '42501');
select test.fails($$select * from public.messages$$,
  'cannot read chat', '42501');
select test.fails($$select * from public.espn_connections$$,
  'cannot read ESPN connections', '42501');
select test.fails($$select * from public.my_espn_connection_status()$$,
  'cannot call my_espn_connection_status()', '42501');
select test.fails($$select public.ensure_game_room('7001')$$,
  'cannot open a game chat room', '42501');
rollback;

begin;
select test.login('alice');
select test.fails($$insert into public.plays (id, game_id, sequence) values ('x', '7001', 2)$$,
  'signed-in users cannot write NFL data either', '42501');
rollback;


-- -----------------------------------------------------------------------------
\echo '4. Rosters are private to their owner'
-- -----------------------------------------------------------------------------
begin;
select test.login('alice');
insert into public.rosters (id, name) values ('a0000000-0000-4000-8000-0000000000a1', 'Alice Squad');
insert into public.roster_players (roster_id, player_id, slot, position)
  values ('a0000000-0000-4000-8000-0000000000a1', '3139477', 'QB', 'QB');
select test.check((select count(*) from public.rosters) = 1,
  'Alice can create and read her roster');
select test.check((select user_id from public.rosters) = test.id('alice'),
  'a new roster belongs to whoever created it');
select test.check((select count(*) from public.roster_players) = 1,
  'Alice can add and read her roster players');
select test.check(test.rows($$update public.roster_players set slot = 'BENCH'$$) = 1,
  'Alice can move her player to the bench');
commit;

begin;
select test.login('bob');
insert into public.rosters (id, name, scoring_format)
  values ('b0000000-0000-4000-8000-0000000000b1', 'Bob Ballers', 'half');
insert into public.roster_players (roster_id, player_id, slot)
  values ('b0000000-0000-4000-8000-0000000000b1', '4241478', 'RB');
select test.check((select count(*) from public.rosters) = 1 and (select name from public.rosters) = 'Bob Ballers',
  'Bob sees only his own roster');
select test.check((select count(*) from public.roster_players) = 1,
  'Bob sees only his own roster players');
select test.check(test.rows($$update public.rosters set name = 'Hacked' where id = 'a0000000-0000-4000-8000-0000000000a1'$$) = 0,
  'Bob cannot rename Alice''s roster');
select test.check(test.rows($$delete from public.rosters where id = 'a0000000-0000-4000-8000-0000000000a1'$$) = 0,
  'Bob cannot delete Alice''s roster');
select test.check(test.rows($$delete from public.roster_players where roster_id = 'a0000000-0000-4000-8000-0000000000a1'$$) = 0,
  'Bob cannot remove Alice''s players');
select test.fails($$insert into public.roster_players (roster_id, player_id, slot) values ('a0000000-0000-4000-8000-0000000000a1', '1234', 'WR')$$,
  'Bob cannot add players to Alice''s roster', '42501');
select test.fails($$insert into public.rosters (user_id, name) values (test.id('alice'), 'Fake')$$,
  'Bob cannot create a roster in Alice''s name', '42501');
select test.fails($$update public.rosters set user_id = test.id('alice')$$,
  'Bob cannot hand his roster over to Alice', '42501');
select test.fails($$insert into public.rosters (name, source) values ('No league', 'espn')$$,
  'an ESPN roster must say which league and team it is', '23514');
commit;

select test.check(
  (select name from public.rosters where id = 'a0000000-0000-4000-8000-0000000000a1') = 'Alice Squad'
  and (select count(*) from public.roster_players where roster_id = 'a0000000-0000-4000-8000-0000000000a1') = 1,
  'double-checked as the database owner: Alice''s roster is untouched');


-- -----------------------------------------------------------------------------
\echo '5. ESPN login cookies are never readable from the app'
-- -----------------------------------------------------------------------------
begin;
select test.login('alice');
select test.fails($$select * from public.espn_connections$$,
  'Alice cannot read the cookie table, not even her own row', '42501');
select test.fails($$insert into public.espn_connections (user_id, encrypted_espn_s2, encrypted_swid) values (auth.uid(), 'x', 'y')$$,
  'Alice cannot write to the cookie table', '42501');
select test.check((select status from public.my_espn_connection_status()) = 'active',
  'Alice can see her connection status');
select test.check((select count(*) from public.my_espn_connection_status()) = 1,
  'the status shows only Alice''s own connection');
select test.check(public.delete_my_espn_connection(),
  'Alice can delete her connection');
select test.check((select count(*) from public.my_espn_connection_status()) = 0,
  'afterwards Alice has no connection');
select test.check(not public.delete_my_espn_connection(),
  'deleting again does nothing');
commit;

select test.check((select count(*) from public.espn_connections where user_id = test.id('bob')) = 1,
  'Bob''s connection was not touched');
select test.check(
  not has_table_privilege('anon', 'public.espn_connections', 'select, insert, update, delete')
  and not has_table_privilege('authenticated', 'public.espn_connections', 'select, insert, update, delete'),
  'browser roles have no permissions at all on the cookie table');


-- -----------------------------------------------------------------------------
\echo '6. Profiles'
-- -----------------------------------------------------------------------------
begin;
select test.login('alice');
select test.check((select count(*) from public.profiles) = 5,
  'signed-in users can see everyone''s name and picture (for chat)');
select test.check(test.rows($$update public.profiles set avatar_url = 'https://example.com/a.png', favorite_team = '901' where id = auth.uid()$$) = 1,
  'Alice can edit her own profile');
select test.fails($$update public.profiles set is_admin = true where id = auth.uid()$$,
  'Alice cannot make herself an admin', '42501');
select test.check(test.rows($$update public.profiles set username = 'hacked' where id = test.id('bob')$$) = 0,
  'Alice cannot edit Bob''s profile');
select test.fails($$update public.profiles set username = 'Not Valid!' where id = auth.uid()$$,
  'usernames must be 3-24 lowercase letters, digits or _', '23514');
select test.fails($$update public.profiles set username = 'bob' where id = auth.uid()$$,
  'usernames are unique', '23505');
select test.fails($$update public.profiles set avatar_url = 'javascript:alert(1)' where id = auth.uid()$$,
  'picture links must be https', '23514');
select test.fails($$delete from public.profiles where id = auth.uid()$$,
  'profiles cannot be deleted from the app', '42501');
commit;

-- Even if someone later loosens the permissions by mistake, the admin flag stays locked.
begin;
grant update (is_admin) on public.profiles to authenticated;
select test.login('alice');
select test.fails($$update public.profiles set is_admin = true where id = auth.uid()$$,
  'second lock: the admin flag is refused even with loosened permissions', '42501');
rollback;

select test.check(not (select is_admin from public.profiles where id = test.id('alice')),
  'Alice is still not an admin');
select test.check(not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'update'),
  'first lock: signed-in users have no permission to change the admin flag');


-- -----------------------------------------------------------------------------
\echo '7. Global chat'
-- -----------------------------------------------------------------------------
begin;
select test.login('alice');
select test.check((select count(*) from public.chat_rooms where type = 'global') = 1,
  'Alice sees the one global room');
insert into public.messages (room_id, user_id, body)
  values (test.room('global'), auth.uid(), '   Hello world   ');
select test.check((select body from public.messages where user_id = auth.uid()) = 'Hello world',
  'Alice can post; extra spaces are trimmed');
select test.fails($$insert into public.messages (room_id, user_id, body) values (test.room('global'), auth.uid(), 'Me again')$$,
  'a second message within 1 second is refused', 'P0001');
commit;

begin;
select test.login('alice');
select test.fails($$insert into public.messages (room_id, body) values (test.room('global'), 'Me again')$$,
  'still refused as a separate request less than 1 second later', 'P0001');
commit;

begin;
select test.login('bob');
select test.fails($$insert into public.messages (room_id, user_id, body) values (test.room('global'), test.id('alice'), 'I am Alice')$$,
  'Bob cannot post as Alice', '42501');
insert into public.messages (room_id, body) values (test.room('global'), 'Hi Alice');
select test.check((select count(*) from public.messages) = 2 and (select user_id from public.messages where body = 'Hi Alice') = auth.uid(),
  'Bob can post (as himself, automatically) and sees both messages');
select test.fails($$update public.messages set body = 'edited' where user_id = auth.uid()$$,
  'messages cannot be edited', '42501');
commit;

begin;
select test.login('erin');
select test.fails($$insert into public.messages (room_id, body) values (test.room('global'), '     ')$$,
  'blank messages are refused', '23514');
select test.fails(format('insert into public.messages (room_id, body) values (%L, %L)', test.room('global'), repeat('x', 501)),
  'messages over 500 characters are refused', '23514');
select test.fails($$insert into public.messages (room_id, body, created_at) values (test.room('global'), 'from the past', '2000-01-01')$$,
  'the app cannot fake when a message was sent', '42501');
commit;

begin;
select test.login_anon();
select test.fails($$insert into public.messages (room_id, user_id, body) values (test.room('global'), test.id('alice'), 'hi')$$,
  'signed-out visitors cannot post', '42501');
rollback;


-- -----------------------------------------------------------------------------
\echo '8. Reactions and reports'
-- -----------------------------------------------------------------------------
begin;
select test.login('bob');
insert into public.message_reactions (message_id, emoji)
  select id, '🔥' from public.messages where user_id = test.id('alice');
select test.check((select count(*) from public.message_reactions) = 1,
  'Bob can react with an allowed emoji');
select test.fails($$insert into public.message_reactions (message_id, emoji) select id, '🍕' from public.messages where user_id = test.id('alice')$$,
  'emoji outside the allowed list are refused', '23514');
select test.fails($$insert into public.message_reactions (message_id, user_id, emoji) select id, test.id('alice'), '😂' from public.messages where user_id = test.id('alice')$$,
  'Bob cannot react as Alice', '42501');
insert into public.reports (message_id, reason)
  select id, 'testing reports' from public.messages where user_id = test.id('alice');
select test.fails($$insert into public.reports (message_id, reason) select id, 'again' from public.messages where user_id = test.id('alice')$$,
  'one report per person per message', '23505');
select test.check((select count(*) from public.reports) = 1,
  'Bob can see his own report');
commit;

begin;
select test.login('alice');
select test.check((select count(*) from public.message_reactions) = 1,
  'Alice sees the reaction on her message');
select test.check((select count(*) from public.reports) = 0,
  'Alice cannot see reports about her message');
commit;

begin;
select test.login('carol');
select test.check((select count(*) from public.reports) = 1,
  'the admin sees all reports');
select test.check((select message_body from public.reports) = 'Hello world',
  'a report keeps a copy of the reported text');
commit;


-- -----------------------------------------------------------------------------
\echo '9. Deleting messages'
-- -----------------------------------------------------------------------------
begin;
select test.login('bob');
select test.check(test.rows($$update public.messages set deleted = true where user_id = test.id('alice')$$) = 0,
  'Bob (not an admin) cannot delete Alice''s message');
select test.check(test.rows($$update public.messages set deleted = true where user_id = auth.uid()$$) = 1,
  'Bob can delete his own message');
select test.check((select body = '' and deleted_by = auth.uid() and deleted_at is not null
                   from public.messages where user_id = auth.uid()),
  'a deleted message has its text wiped and records who deleted it');
select test.fails($$update public.messages set deleted = false where user_id = auth.uid()$$,
  'a deleted message cannot be restored', '42501');
commit;

select test.check(not (select deleted from public.messages where user_id = test.id('alice')),
  'double-checked as the database owner: Alice''s message is still there');

begin;
select test.login('carol');
select test.check(test.rows($$update public.messages set deleted = true where user_id = test.id('alice')$$) = 1,
  'the admin can delete anyone''s message');
select test.check((select deleted_by from public.messages where user_id = test.id('alice')) = auth.uid(),
  'the message records that the admin deleted it');
select test.check((select message_body from public.reports) = 'Hello world',
  'the report still shows what was said');
commit;

begin;
select test.login('bob');
select test.fails($$insert into public.message_reactions (message_id, emoji) select id, '👏' from public.messages where user_id = test.id('alice')$$,
  'nobody can react to a deleted message', '42501');
commit;


-- -----------------------------------------------------------------------------
\echo '10. League chat rooms'
-- -----------------------------------------------------------------------------
select test.pause();

begin;
select test.login('alice');
insert into public.rosters (name, source, espn_league_id, espn_team_id, season)
  values ('Alice ESPN', 'espn', '424242', '1', 2026);
select test.fails($$select public.ensure_league_room('424242')$$,
  'naming a league isn''t enough: an unverified member cannot open its room', '42501');
select test.fails($$update public.rosters set espn_verified = true where espn_league_id = '424242'$$,
  'you cannot verify your own league membership', '42501');
select test.fails($$insert into public.rosters (name, source, espn_league_id, espn_team_id, season, espn_verified)
    values ('Fake', 'espn', '999999', '1', 2026, true)$$,
  'you cannot create a verified membership either', '42501');
commit;

-- The server verifies Alice after reading the league with her own ESPN login.
begin;
set local role service_role;
update public.rosters set espn_verified = true where espn_league_id = '424242' and user_id = test.id('alice');
commit;

begin;
select test.login('alice');
select test.check(public.ensure_league_room('424242') = public.ensure_league_room('424242'),
  'a league member can open the league room, and always gets the same one');
insert into public.messages (room_id, body) values (test.room('league', '424242'), 'League trash talk');
select test.check((select count(*) from public.messages where room_id = test.room('league', '424242')) = 1,
  'Alice can post in her league room');
commit;

begin;
select test.login('bob');
select test.check((select count(*) from public.chat_rooms where type = 'league') = 0,
  'Bob (not in the league) cannot see the league room');
select test.check((select count(*) from public.messages where room_id = test.room('league', '424242')) = 0,
  'Bob cannot read the league chat');
select test.fails($$insert into public.messages (room_id, body) values (test.room('league', '424242'), 'let me in')$$,
  'Bob cannot post in the league room', '42501');
select test.fails($$select public.ensure_league_room('424242')$$,
  'Bob cannot open the league room', '42501');
commit;

begin;
select test.login('bob');
insert into public.rosters (name, source, espn_league_id, espn_team_id, season)
  values ('Bob ESPN', 'espn', '424242', '2', 2026);
select test.check((select count(*) from public.chat_rooms where type = 'league') = 0,
  'claiming the league isn''t enough for Bob either');
commit;

begin;
set local role service_role;
update public.rosters set espn_verified = true where espn_league_id = '424242' and user_id = test.id('bob');
commit;

begin;
select test.login('bob');
select test.check((select count(*) from public.chat_rooms where type = 'league') = 1,
  'once the server verifies Bob in the league, he sees the room');
select test.check((select body from public.messages where room_id = test.room('league', '424242')) = 'League trash talk',
  '...can read its messages');
insert into public.messages (room_id, body) values (test.room('league', '424242'), 'Bring it');
select test.check((select count(*) from public.messages where room_id = test.room('league', '424242')) = 2,
  '...and can post there');
commit;


-- -----------------------------------------------------------------------------
\echo '11. Game chat rooms'
-- -----------------------------------------------------------------------------
begin;
select test.login('alice');
select test.check(public.ensure_game_room('7001') = public.ensure_game_room('7001'),
  'ensure_game_room gives the same room every time');
select test.check((select count(*) from public.chat_rooms where type = 'game' and ref_id = '7001') = 1,
  'only one room exists for the game');
select test.check((select title from public.chat_rooms where type = 'game' and ref_id = '7001') = 'AWY @ HOM',
  'the room is named after the matchup');
commit;

begin;
select test.login('bob');
select test.check(public.ensure_game_room('7001') = test.room('game', '7001'),
  'another user gets the same room');
select test.check(public.ensure_game_room('7002') is not null,
  'a room can be opened before the worker has stored the game');
select test.fails($$select public.ensure_game_room('bad id; drop table x')$$,
  'a malformed game id is refused', '22023');
select test.fails($$insert into public.chat_rooms (type, ref_id) values ('game', '7003')$$,
  'rooms cannot be created directly from the app', '42501');
commit;

select test.fails($$insert into public.chat_rooms (type, title) values ('global', 'Second global')$$,
  'there can only ever be one global room', '23505');


-- -----------------------------------------------------------------------------
\echo '12. Blocking'
-- -----------------------------------------------------------------------------
begin;
select test.login('alice');
insert into public.user_blocks (blocked_id) values (test.id('bob'));
select test.check((select count(*) from public.messages where user_id = test.id('bob')) = 0,
  'after blocking Bob, Alice no longer sees his messages');
select test.fails($$insert into public.user_blocks (blocked_id) values (auth.uid())$$,
  'you cannot block yourself', '23514');
select test.fails($$insert into public.user_blocks (blocker_id, blocked_id) values (test.id('bob'), test.id('carol'))$$,
  'you cannot create blocks for someone else', '42501');
commit;

begin;
select test.login('bob');
select test.check((select count(*) from public.user_blocks) = 0,
  'Bob cannot see who blocked him');
select test.check((select count(*) from public.messages where user_id = test.id('alice')) = 2,
  'Bob still sees Alice''s messages (blocking is one-way)');
commit;

begin;
select test.login('alice');
delete from public.user_blocks where blocked_id = test.id('bob');
select test.check((select count(*) from public.messages where user_id = test.id('bob')) = 2,
  'after unblocking, Bob''s messages are visible again');
commit;


-- -----------------------------------------------------------------------------
\echo '12b. Community: channels, threads, reactions, polls, unread, mutes, public teams'
-- -----------------------------------------------------------------------------
create function test.channel(channel_slug text) returns uuid
language sql stable security definer set search_path = ''
as $$ select cr.id from public.chat_rooms cr where cr.slug = channel_slug $$;

begin;
select test.login('alice');
select test.check((select count(*) from public.chat_rooms where type = 'channel') = 5,
  'every signed-in user sees the five channels');
select test.check((select title from public.chat_rooms where slug = 'general') = 'General',
  'the old global room is now General');
select test.check(public.ensure_player_room('4374302', 'Amon-Ra St. Brown') = public.ensure_player_room('4374302', 'Someone Else'),
  'a player room is created once and reused');
select test.check((select title from public.chat_rooms where type = 'player' and ref_id = '4374302') = 'Amon-Ra St. Brown',
  'a player room keeps the name it was created with');
select test.fails($$select public.ensure_player_room('drop table x', 'x')$$,
  'a player room needs a real player id', '22023');
select test.fails($$insert into public.chat_rooms (type, slug, title) values ('channel', 'fake', 'Fake')$$,
  'nobody can create channels from the app', '42501');
commit;

select test.pause();
begin;
select test.login('alice');
insert into public.messages (room_id, body) values (test.channel('trades'), 'Is Chase for Bijan fair?');
commit;

begin;
select test.login_anon();
select test.fails($$select public.ensure_player_room('4374302', 'x')$$, 'signed-out visitors cannot open player rooms', '42501');
select test.fails($$select count(*) from public.public_teams$$, 'signed-out visitors cannot read public teams', '42501');
select test.fails($$select count(*) from public.chat_polls$$, 'signed-out visitors cannot read polls', '42501');
commit;

select test.pause();
begin;
select test.login('bob');
insert into public.messages (room_id, body, thread_id)
  select test.channel('trades'), 'Smash accept', m.id from public.messages m where m.body = 'Is Chase for Bijan fair?';
select test.check((select thread_reply_count from public.messages where body = 'Is Chase for Bijan fair?') = 1,
  'a thread reply counts on its root (kept by the database)');
select test.fails($$insert into public.messages (room_id, body, thread_reply_count) values (test.channel('trades'), 'x', 99)$$,
  'nobody can set a thread''s reply count', '42501');
select test.fails($$insert into public.messages (room_id, body, reply_to)
    select test.channel('waivers'), 'wrong room', m.id from public.messages m where m.body = 'Is Chase for Bijan fair?'$$,
  'a reply must be in the same channel as the message it answers', '22023');
select test.fails($$insert into public.messages (room_id, body, thread_id)
    select test.channel('trades'), 'nested', m.id from public.messages m where m.body = 'Smash accept'$$,
  'threads cannot nest', '22023');
insert into public.message_reactions (message_id, emoji)
  select m.id, '❤️' from public.messages m where m.body = 'Is Chase for Bijan fair?';
select test.fails($$insert into public.message_reactions (message_id, emoji)
    select m.id, '🤡' from public.messages m where m.body = 'Is Chase for Bijan fair?'$$,
  'only the curated reactions are allowed', '23514');
select test.fails($$insert into public.message_reactions (message_id, user_id, emoji)
    select m.id, test.id('alice'), '🔥' from public.messages m where m.body = 'Is Chase for Bijan fair?'$$,
  'you cannot react as someone else', '42501');
commit;

begin;
select test.login('dave');
select test.fails($$insert into public.messages (room_id, body, attachments) values (test.channel('trades'), 'x', '{"script": "<b>"}')$$,
  'attachments only take the known kinds', '23514');
commit;

-- Polls
select test.pause();
begin;
select test.login('alice');
insert into public.messages (room_id, body, attachments) values (test.channel('start-sit'), 'Who do I start?', '{"poll": true}');
insert into public.chat_polls (message_id, question, options)
  select m.id, 'Who do I start?', array['Player A', 'Player B'] from public.messages m where m.body = 'Who do I start?';
select test.fails($$insert into public.chat_polls (message_id, question, options)
    select m.id, 'Bad', array['only one'] from public.messages m where m.body = 'Smash accept'$$,
  'you cannot attach a poll to someone else''s message', '42501');
commit;

begin;
select test.login('bob');
insert into public.chat_poll_votes (message_id, option_index)
  select p.message_id, 1 from public.chat_polls p;
update public.chat_poll_votes set option_index = 0;
select test.check((select option_index from public.chat_poll_votes where user_id = auth.uid()) = 0,
  'you can change your vote');
select test.fails($$insert into public.chat_poll_votes (message_id, user_id, option_index)
    select p.message_id, test.id('carol'), 0 from public.chat_polls p$$,
  'you cannot vote as someone else', '42501');
select test.fails($$update public.chat_poll_votes set option_index = 9$$,
  'a vote must be one of the options', '22023');
select test.fails($$insert into public.chat_poll_votes (message_id, option_index) select p.message_id, 0 from public.chat_polls p$$,
  'one vote per person per poll', '23505');
commit;

begin;
select test.login('alice');
select test.check((select count(*) from public.chat_poll_votes) = 1, 'everyone sees a poll''s votes');
select test.check(test.rows($$update public.chat_poll_votes set option_index = 1$$) = 0,
  'you cannot change someone else''s vote');
commit;

-- Unread counts, read state, mutes
begin;
select test.login('carol');
select test.check((select unread from public.my_unread_counts() where room_id = test.channel('trades')) = 1,
  'unread counts main-channel messages only (the thread reply does not count)');
insert into public.chat_read_state (room_id) values (test.channel('trades'));
select test.check(not exists (select 1 from public.my_unread_counts() where room_id = test.channel('trades')),
  'opening a channel clears its unread count');
select test.check(exists (select 1 from public.my_unread_counts() where room_id = test.channel('start-sit')),
  'other channels keep their unread count');
select test.fails($$insert into public.chat_read_state (user_id, room_id) values (test.id('alice'), test.channel('waivers'))$$,
  'you cannot mark rooms read for someone else', '42501');
insert into public.user_mutes (muted_id) values (test.id('alice'));
select test.check(not exists (select 1 from public.my_unread_counts() where room_id = test.channel('start-sit')),
  'muted people don''t count as unread');
commit;

begin;
select test.login('alice');
select test.check((select count(*) from public.chat_read_state) = 0, 'read state is private');
select test.check((select count(*) from public.user_mutes) = 0, 'mutes are private');
commit;

-- Flood limit: 20 messages in a minute is the most anyone can send.
begin;
set local session_replication_role = replica;  -- test setup only: insert history without triggers
insert into public.messages (room_id, user_id, body, created_at)
  select test.channel('general'), test.id('erin'), 'flood ' || n, now() - interval '30 seconds' + n * interval '1 second'
  from generate_series(1, 20) n;
commit;
begin;
select test.login('erin');
select test.fails($$insert into public.messages (room_id, body) values (test.channel('general'), 'one more')$$,
  'a flood of messages is stopped (20 a minute)', 'P0001');
commit;

-- Public teams and profiles
begin;
select test.login('alice');
insert into public.public_teams (local_id, name, record, roster)
  values ('t_alice1', 'Sunday Scaries', '4-2', '[{"id": "4374302", "name": "Amon-Ra St. Brown", "position": "WR", "slot": "WR"}]');
update public.profiles set primary_team_id = (select id from public.public_teams where local_id = 't_alice1'), bio = 'WR truther'
 where id = auth.uid();
select test.fails($$insert into public.public_teams (user_id, local_id, name) values (test.id('bob'), 't_bobfake', 'Fake')$$,
  'you cannot publish a team as someone else', '42501');
select test.fails($$update public.public_teams set logo_url = 'https://evil.example.com/x.png'$$,
  'team logos must be ESPN-hosted', '23514');
commit;

begin;
select test.login('bob');
select test.check((select name from public.public_teams where local_id = 't_alice1') = 'Sunday Scaries',
  'other people can see a team you made public');
select test.check(test.rows($$update public.public_teams set name = 'Hacked'$$) = 0,
  'nobody can edit someone else''s public team');
select test.fails($$update public.profiles set primary_team_id = (select id from public.public_teams where local_id = 't_alice1') where id = auth.uid()$$,
  'your primary team has to be your own', '42501');
commit;

begin;
select test.login('alice');
update public.profiles set is_public = false where id = auth.uid();
commit;
begin;
select test.login('bob');
select test.check(not exists (select 1 from public.public_teams where local_id = 't_alice1'),
  'a private profile hides its teams');
select test.check((select username from public.profiles where id = test.id('alice')) = 'alice',
  'a private profile still shows its username in chat');
commit;


-- -----------------------------------------------------------------------------
\echo '13. Whole-database checks'
-- -----------------------------------------------------------------------------
select test.check(not exists (
    select 1 from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity),
  'Row Level Security is on for every table');

select test.check(not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')),
  'every function has a fixed search_path');

select test.check(not exists (
    select 1 from pg_constraint fk
    where fk.contype = 'f' and fk.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = fk.conrelid
          and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(fk.conkey)] = fk.conkey)),
  'every foreign key has an index');

select test.check(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'espn_connections'),
  'the cookie table has no policies at all (server only)');

select test.check(
  not has_function_privilege('anon', 'public.my_espn_connection_status()', 'execute')
  and not has_function_privilege('anon', 'public.delete_my_espn_connection()', 'execute')
  and not has_function_privilege('anon', 'public.ensure_game_room(text)', 'execute')
  and not has_function_privilege('anon', 'public.ensure_league_room(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
  and not has_function_privilege('authenticated', 'public.messages_before_insert()', 'execute'),
  'private functions cannot be called by the wrong people');

select test.check((
    select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('games', 'plays', 'player_play_points', 'player_game_stats',
                        'injury_events', 'messages', 'message_reactions')) = 7,
  'the 7 live tables are on Supabase Realtime');

\echo ''
select format('PASS: all %s database security checks passed.', last_value) from test.checks;
