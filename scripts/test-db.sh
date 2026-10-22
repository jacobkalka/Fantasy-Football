#!/usr/bin/env bash
# =============================================================================
# Database rules test.
#
# Starts a brand-new, empty PostgreSQL database in a temporary folder, makes
# it look like Supabase (supabase/tests/local_stub.sql), applies every
# migration in supabase/migrations/ in order, then runs
# supabase/tests/rls_test.sql, which tries to break each security rule.
# The temporary database is always stopped and deleted afterwards.
#
# Usage (from the project folder):   bash scripts/test-db.sh
# Prints "PASS" and exits 0 only if every check passed.
#
# Needs the PostgreSQL 16 server programs (initdb, pg_ctl, postgres) and psql.
# Set PG_BIN=/path/to/postgres/bin to choose a specific install.
# It never connects to a real Supabase project.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STUB="$ROOT/supabase/tests/local_stub.sql"
TESTS="$ROOT/supabase/tests/rls_test.sql"
MIGRATIONS_DIR="$ROOT/supabase/migrations"

# --- Find PostgreSQL ---------------------------------------------------------
find_pg_bin() {
  local dir
  if [[ -n "${PG_BIN:-}" ]]; then echo "$PG_BIN"; return 0; fi
  for dir in /usr/lib/postgresql/16/bin /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@16/bin \
             /usr/local/opt/postgresql@16/bin; do
    if [[ -x "$dir/initdb" ]]; then echo "$dir"; return 0; fi
  done
  if command -v pg_config >/dev/null 2>&1 && [[ -x "$(pg_config --bindir)/initdb" ]]; then
    pg_config --bindir; return 0
  fi
  if command -v initdb >/dev/null 2>&1; then dirname "$(command -v initdb)"; return 0; fi
  return 1
}

if ! PG_BIN="$(find_pg_bin)"; then
  echo "error: PostgreSQL server programs (initdb, pg_ctl) not found. Install PostgreSQL 16 or set PG_BIN." >&2
  exit 1
fi
PSQL="$PG_BIN/psql"
[[ -x "$PSQL" ]] || PSQL="$(command -v psql)"

# --- Temporary folder, and who runs the database -----------------------------
WORK="$(mktemp -d "${TMPDIR:-/tmp}/feed-db-test.XXXXXX")"
DATA="$WORK/data"
LOG="$WORK/postgres.log"
STARTED=0

# PostgreSQL refuses to run as root, so when this script runs as root it
# starts the database as an ordinary system user instead.
RUN_AS=""
if [[ "$(id -u)" -eq 0 ]]; then
  if id -u postgres >/dev/null 2>&1; then RUN_AS=postgres; else RUN_AS=nobody; fi
  chown "$RUN_AS" "$WORK"
fi

as_db_user() {
  if [[ -n "$RUN_AS" ]]; then
    runuser -u "$RUN_AS" -- "$@"
  else
    "$@"
  fi
}

cleanup() {
  local status=$?
  if [[ "$STARTED" -eq 1 ]]; then
    as_db_user "$PG_BIN/pg_ctl" -D "$DATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  if [[ "$status" -ne 0 && -s "$LOG" ]]; then
    echo "--- last lines of the database log ---" >&2
    tail -n 20 "$LOG" >&2 || true
  fi
  rm -rf "$WORK"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

cd "$WORK"   # a folder the database user can always read

if [[ -n "$RUN_AS" ]] && ! as_db_user test -w "$WORK"; then
  echo "error: user '$RUN_AS' cannot use $WORK. Point TMPDIR at a folder it can reach, e.g. TMPDIR=/tmp." >&2
  exit 1
fi

# --- Pick a free port (local only; nothing outside this computer can connect)
port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
PORT="${DB_TEST_PORT:-54329}"
for _ in $(seq 1 50); do
  port_in_use "$PORT" || break
  PORT=$((PORT + 1))
done

# --- Create and start the throwaway database ---------------------------------
echo "Starting a throwaway PostgreSQL $("$PG_BIN/postgres" --version | awk '{print $3}') on port $PORT"
if ! as_db_user "$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C --no-sync \
     >"$WORK/initdb.log" 2>&1; then
  cat "$WORK/initdb.log" >&2
  exit 1
fi

STARTED=1
as_db_user "$PG_BIN/pg_ctl" -D "$DATA" -l "$LOG" -w -t 60 \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -k '' -c wal_level=logical -c fsync=off -c full_page_writes=off" \
  start >/dev/null

run_sql() {
  PGCLIENTENCODING=UTF8 "$PSQL" -X -q -v ON_ERROR_STOP=1 \
    -h 127.0.0.1 -p "$PORT" -U postgres -d postgres "$@"
}

# --- Apply everything ---------------------------------------------------------
echo "Applying supabase/tests/local_stub.sql (local stand-in for Supabase)"
run_sql --single-transaction -f "$STUB"

shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.sql)
if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "error: no migrations found in $MIGRATIONS_DIR" >&2
  exit 1
fi
for migration in "${migrations[@]}"; do
  echo "Applying migration ${migration#"$ROOT"/}"
  run_sql --single-transaction -f "$migration"
done

echo "Running supabase/tests/rls_test.sql"
run_sql -f "$TESTS"
