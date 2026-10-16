#!/bin/sh
set -eu
TASK=prune
. /opt/backup/lib.sh
ensure_dirs

BASE_KEEP="${BASE_BACKUPS_KEEP:-7}"
DAILY_DAYS="${DUMP_DAILY_KEEP_DAYS:-30}"
MONTHLY_DAYS="${DUMP_MONTHLY_KEEP_DAYS:-365}"
RECENT_HOURS="${DUMP_ALL_KEEP_HOURS:-48}"

cutoff() {
  date -u -d "@$(( $(now) - $1 ))" +%Y%m%d%H%M%S
}

recent=$(cutoff $(( RECENT_HOURS * 3600 )))
daily=$(cutoff $(( DAILY_DAYS * 86400 )))
monthly=$(cutoff $(( MONTHLY_DAYS * 86400 )))

ls -1 "$BACKUP_DIR"/dumps/dump-*.dump 2>/dev/null | sort | awk -v recent="$recent" -v daily="$daily" -v monthly="$monthly" '
{
  name = $0
  stamp = name
  sub(/.*dump-/, "", stamp)
  sub(/\.dump$/, "", stamp)
  gsub(/-/, "", stamp)
  day = substr(stamp, 1, 8)
  month = substr(stamp, 1, 6)
  keep = 0
  if (stamp >= recent) keep = 1
  else if (stamp >= daily && !(day in seenDay)) keep = 1
  else if (stamp >= monthly && !(month in seenMonth)) keep = 1
  if (stamp < recent) { seenDay[day] = 1; seenMonth[month] = 1 }
  if (keep == 0) print name
}' | while read -r victim; do
  log "eliminando dump antiguo $victim"
  rm -f "$victim" "$victim.meta" "$victim.sha256"
done

bases=$(ls -1d "$BACKUP_DIR"/base/base-* 2>/dev/null | grep -v '\.partial$' | sort || true)
count=$(printf '%s\n' "$bases" | grep -c . || true)
if [ "$count" -gt "$BASE_KEEP" ]; then
  excess=$(( count - BASE_KEEP ))
  printf '%s\n' "$bases" | head -n "$excess" | while read -r victim; do
    log "eliminando copia base antigua $victim"
    rm -rf "$victim"
  done
fi

oldest=$(ls -1d "$BACKUP_DIR"/base/base-* 2>/dev/null | grep -v '\.partial$' | sort | head -n 1 || true)
if [ -n "$oldest" ] && [ -f "$oldest/backup_history_file" ]; then
  history=$(cat "$oldest/backup_history_file")
  if [ -f "$WAL_DIR/$history" ]; then
    log "limpiando WAL anterior a $history"
    pg_archivecleanup "$WAL_DIR" "$history"
  fi
fi
