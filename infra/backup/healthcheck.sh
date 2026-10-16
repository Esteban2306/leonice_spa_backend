#!/bin/sh
. /opt/backup/lib.sh

DUMP_H="${DUMP_INTERVAL_HOURS:-6}"
BASE_H="${BASE_INTERVAL_HOURS:-24}"
VERIFY_H="${VERIFY_INTERVAL_HOURS:-168}"
WAL_M="${WAL_SYNC_INTERVAL_MINUTES:-5}"
problems=""

stale() {
  last=$(get_status "$1")
  if [ "$last" -eq 0 ] || [ $(( $(now) - last )) -gt "$2" ]; then
    problems="$problems $1"
  fi
}

stale last_dump_ok $(( DUMP_H * 7200 + 900 ))
stale last_base_ok $(( BASE_H * 7200 + 900 ))
stale last_verify_ok $(( VERIFY_H * 7200 + 3600 ))

if [ -n "${BACKUP_REMOTE:-}" ]; then
  stale last_offsite_ok $(( BASE_H * 7200 + 900 ))
  stale last_wal_sync_ok $(( WAL_M * 120 + 300 ))
fi

if [ -f "$STATUS_DIR/last_verify_error" ]; then
  problems="$problems verify_error:$(cat "$STATUS_DIR/last_verify_error")"
fi

archiver=$(psql -X -Atc "SELECT COALESCE(last_failed_time IS NULL OR last_archived_time > last_failed_time, true) FROM pg_stat_archiver" 2>/dev/null || echo f)
[ "$archiver" = "t" ] || problems="$problems wal_archiver"

if [ -n "$problems" ]; then
  printf 'NO SALUDABLE:%s\n' "$problems"
  exit 1
fi
printf 'ok\n'
