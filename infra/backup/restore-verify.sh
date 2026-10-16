#!/bin/sh
set -eu
TASK=verify
. /opt/backup/lib.sh
ensure_dirs

MODE="${1:-all}"
PORT=5499
TMP=$(mktemp -d /tmp/verify.XXXXXX)
RUNNING=""

cleanup() {
  if [ -n "$RUNNING" ]; then
    pg_ctl -D "$RUNNING" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

fail() {
  set_status last_verify_error "$(now) $*"
  die "verificación fallida: $*"
}

restored() {
  PGHOST="$TMP" PGPORT="$PORT" PGUSER="${RESTORE_USER:-verify}" PGDATABASE="$1" psql -X -Atc "$2"
}

primary_setting() {
  psql -X -Atc "SHOW $1"
}

start_instance() {
  datadir="$1"
  extra="${2:-}"
  pg_ctl -D "$datadir" -w -t 900 -l "$TMP/$(basename "$datadir").log" \
    -o "-p $PORT -k $TMP -c listen_addresses='' -c archive_mode=off -c shared_buffers=64MB $extra" start >/dev/null \
    || { tail -n 30 "$TMP/$(basename "$datadir").log" >&2 || true; fail "no arrancó la instancia temporal"; }
  RUNNING="$datadir"
}

standby_limits() {
  for setting in max_connections max_worker_processes max_wal_senders max_prepared_transactions max_locks_per_transaction; do
    printf -- '-c %s=%s ' "$setting" "$(primary_setting "$setting")"
  done
}

stop_instance() {
  pg_ctl -D "$RUNNING" -m fast -w stop >/dev/null 2>&1 || true
  RUNNING=""
}

structural_checks() {
  db="$1"
  invalid_constraints=$(restored "$db" "SELECT count(*) FROM pg_constraint WHERE NOT convalidated")
  [ "$invalid_constraints" = "0" ] || fail "$invalid_constraints restricciones sin validar en la restauración"
  invalid_indexes=$(restored "$db" "SELECT count(*) FROM pg_index WHERE NOT indisvalid")
  [ "$invalid_indexes" = "0" ] || fail "$invalid_indexes índices inválidos en la restauración"
}

verify_logical() {
  dump=$(ls -1 "$BACKUP_DIR"/dumps/dump-*.dump 2>/dev/null | sort | tail -n 1 || true)
  [ -n "$dump" ] || fail "no hay dumps lógicos"
  meta="$dump.meta"
  [ -f "$meta" ] || fail "el dump $dump no tiene metadatos"

  expected=$(sed -n 's/^sha256=//p' "$meta")
  [ "$expected" = "$(file_sha256 "$dump")" ] || fail "checksum del dump no coincide"

  log "restaurando $(basename "$dump") en una instancia aislada"
  started=$(now)
  initdb -D "$TMP/logical" -U verify --auth=trust >/dev/null
  start_instance "$TMP/logical" "-c max_connections=20"
  createdb -h "$TMP" -p "$PORT" -U verify restore_check
  pg_restore -h "$TMP" -p "$PORT" -U verify -d restore_check --no-owner --exit-on-error "$dump" \
    || fail "pg_restore terminó con errores"

  tables=$(restored restore_check "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
  [ "$tables" = "$(sed -n 's/^tables=//p' "$meta")" ] || fail "número de tablas distinto al del dump"
  [ "$(restored restore_check "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1")" = "$(sed -n 's/^migration=//p' "$meta")" ] \
    || fail "la última migración restaurada no coincide"

  for table in $CRITICAL_TABLES; do
    got=$(restored restore_check "SELECT count(*) FROM \"$table\"")
    want=$(sed -n "s/^count_$table=//p" "$meta")
    [ "$got" -ge "$want" ] || fail "$table: $got filas restauradas, se esperaban al menos $want"
  done
  structural_checks restore_check
  stop_instance
  log "verificación lógica correcta en $(( $(now) - started ))s"
  set_status last_verify_logical_ok "$(now)"
}

verify_physical() {
  base=$(ls -1d "$BACKUP_DIR"/base/base-* 2>/dev/null | grep -v '\.partial$' | sort | tail -n 1 || true)
  [ -n "$base" ] || fail "no hay copias base físicas"
  log "recuperando $(basename "$base") + archivo WAL en una instancia aislada"
  started=$(now)
  sh /opt/backup/restore-physical.sh "$TMP/physical" latest "$base" >/dev/null
  RESTORE_USER="${PGUSER_SUPERUSER:-${POSTGRES_SUPERUSER:-postgres_admin}}"
  start_instance "$TMP/physical" "$(standby_limits)"

  waited=0
  while [ "$(PGHOST="$TMP" PGPORT="$PORT" PGUSER="$RESTORE_USER" PGDATABASE=postgres psql -X -Atc 'SELECT pg_is_in_recovery()' 2>/dev/null || echo t)" = "t" ]; do
    waited=$((waited + 2))
    [ "$waited" -lt 600 ] || fail "la recuperación no terminó en 10 minutos"
    sleep 2
  done

  db="${PGDATABASE:-postgres}"
  export RESTORE_USER
  [ "$(restored "$db" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")" = "$(public_table_count)" ] \
    || fail "recuperación física: número de tablas distinto al del origen"
  [ "$(restored "$db" "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1")" = "$(latest_migration)" ] \
    || fail "recuperación física: la última migración no coincide"
  structural_checks "$db"

  for table in $CRITICAL_TABLES; do
    log "recuperación física $table: $(restored "$db" "SELECT count(*) FROM \"$table\"") filas (origen: $(table_count "$table"))"
  done
  stop_instance
  log "verificación física correcta en $(( $(now) - started ))s"
  set_status last_verify_physical_ok "$(now)"
}

case "$MODE" in
  logical) verify_logical ;;
  physical) verify_physical ;;
  all)
    verify_logical
    verify_physical
    ;;
  *) die "modo desconocido: $MODE" ;;
esac

set_status last_verify_ok "$(now)"
rm -f "$STATUS_DIR/last_verify_error"
