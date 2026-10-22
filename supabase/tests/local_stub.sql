-- =============================================================================
-- !!!  LOCAL TESTING ONLY. NEVER RUN THIS FILE AGAINST A REAL SUPABASE PROJECT.  !!!
-- =============================================================================
-- Real Supabase already has everything below, and much more. This file makes a
-- bare PostgreSQL database *pretend* to be Supabase, just well enough that
-- scripts/test-db.sh can apply our migrations unchanged and then try to break
-- their security rules on a throwaway database.
--
-- It has a safety catch: it stops immediately if it sees signs of Supabase.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth')
     or exists (select 1 from pg_roles
                where rolname in ('supabase_admin', 'authenticator', 'supabase_auth_admin')) then
    raise exception 'STOP: this looks like a real Supabase database. local_stub.sql is only for local tests.';
  end if;
end;
$$;

-- 1. The roles Supabase's API uses for each request.
create role anon          nologin noinherit;                 -- signed-out visitor
create role authenticated nologin noinherit;                 -- signed-in user
create role service_role  nologin noinherit bypassrls;       -- our server (skips RLS)
-- Stand-in for Supabase's sign-in service: owns auth.users, no rights on our tables.
create role local_auth_admin nologin noinherit;

-- 2. A minimal copy of Supabase's "auth" schema.
create schema auth;
grant usage on schema auth to anon, authenticated, service_role, local_auth_admin;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);
alter table auth.users owner to local_auth_admin;

-- Same definitions Supabase uses: read the signed-in user from the request's JWT claims.
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

-- 3. Supabase's default permissions on the public schema: new tables and
--    functions are open to all three API roles, and RLS policies do the real
--    work. (Our migration tightens this explicitly; these defaults prove it does.)
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- 4. The publication Supabase Realtime listens to (starts empty, like Supabase's).
create publication supabase_realtime;
