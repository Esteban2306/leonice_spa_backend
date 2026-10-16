#!/bin/sh
TASK=daemon
. /opt/backup/lib.sh

DUMP_H="${DUMP_INTERVAL_HOURS:-6}"
BASE_H="${BASE_INTERVAL_HOURS:-24}"
VERIFY_H="${VERIFY_INTERVAL_HOURS:-168}"
WAL_M="${WAL_SYNC_INTERVAL_MINUTES:-5}"
RETRY_M="${BACKUP_RETRY_MINUTES:-15}"
TICK="${BACKUP_TICK_SECONDS:-30}"

STOP=0
trap 'STOP=1' TERM INT

due() {
  name="$1"
  interval="$2"
  ok=$(get_status "last_${name}_ok")
  attempt=$(get_status "last_${name}_attempt")
  t=$(now)
  if [ "$ok" -gt 0 ] && [ $(( t - ok )) -lt "$interval" ]; then
    return 1
  fi
  if [ "$attempt" -gt 0 ] && [ "$attempt" -gt "$ok" ] && [ $(( t - attempt )) -lt $(( RETRY_M * 60 )) ]; then
    return 1
  fi
  return 0
}

run_task() {
  name="$1"
  script="$2"
  shift 2
  set_status "last_${name}_attempt" "$(now)"
  if sh "/opt/backup/$script" "$@"; then
    return 0
  fi
  log "la tarea $name falló; se reintentará en ${RETRY_M} minutos"
  return 1
}

ensure_dirs
until pg_isready -q -t 5; do
  log "esperando a PostgreSQL"
  sleep 5
done
log "servicio de respaldo iniciado (dump cada ${DUMP_H} h, copia base cada ${BASE_H} h, verificación cada ${VERIFY_H} h)"

while [ "$STOP" -eq 0 ]; do
  if [ -n "${BACKUP_REMOTE:-}" ] && due wal_sync $(( WAL_M * 60 )); then
    run_task wal_sync wal-sync.sh || true
  fi
  if due dump $(( DUMP_H * 3600 )); then
    if run_task dump pg-dump.sh; then sh /opt/backup/prune.sh || true; fi
  fi
  if due base $(( BASE_H * 3600 )); then
    if run_task base pg-basebackup.sh; then sh /opt/backup/prune.sh || true; fi
  fi
  if [ "$(get_status last_dump_ok)" -gt 0 ] && [ "$(get_status last_base_ok)" -gt 0 ] && due verify $(( VERIFY_H * 3600 )); then
    run_task verify restore-verify.sh all || true
  fi
  sleep "$TICK" &
  wait $!
done
log "servicio de respaldo detenido"
