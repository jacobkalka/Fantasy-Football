-- =============================================================================
-- FantasyLab: Admin Mode (server-only tables).
--
-- The administrator code is checked by the server (app/api/admin/session) against a
-- hash kept in a hosting secret; neither the code nor its hash is ever stored here.
-- These two tables hold only:
--   * admin_attempts: every try (account, hashed network address, outcome), for the
--     brute-force lockouts and for spotting repeated attempts;
--   * admin_sessions: active Admin Mode sessions (a hash of the session token).
--
-- Row-level security is on and there are NO policies and NO grants for anon or
-- authenticated: browsers can't read or write either table, whatever they send.
-- Only the server, with the secret key (service_role), can.
-- =============================================================================

create table public.admin_attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  -- HMAC of the network address with a server secret: raw addresses are never stored.
  ip_hash    text not null constraint admin_attempts_ip_hash_length check (char_length(ip_hash) between 16 and 128),
  outcome    text not null constraint admin_attempts_outcome_valid check (outcome in ('success', 'failure', 'locked')),
  created_at timestamptz not null default now()
);

create index admin_attempts_user_id_created_at_idx on public.admin_attempts (user_id, created_at);
create index admin_attempts_ip_hash_created_at_idx on public.admin_attempts (ip_hash, created_at);

create table public.admin_sessions (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- sha256 of the session token (hex). The token itself lives only in the HttpOnly cookie.
  token_hash text not null constraint admin_sessions_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint admin_sessions_expiry_after_creation check (expires_at > created_at)
);

create index admin_sessions_user_id_idx on public.admin_sessions (user_id);

alter table public.admin_attempts enable row level security;
alter table public.admin_sessions enable row level security;

revoke all on public.admin_attempts, public.admin_sessions from public, anon, authenticated;
grant all on public.admin_attempts, public.admin_sessions to service_role;
