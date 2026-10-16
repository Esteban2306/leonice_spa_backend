#!/bin/sh
set -eu
TASK=dump
. /opt/backup/lib.sh
ensure_dirs

stamp=$(date -u +%Y%m%d-%H%M%S)
final="$BACKUP_DIR/dumps/dump-$stamp.dump"
partial="$final.partial"
meta="$final.meta"
trap 'rm -f "$partial"' EXIT

log "iniciando dump lógico $stamp"
{
  printf 'taken_at=%s\n' "$(now)"
  printf 'migration=%s\n' "$(latest_migration)"
  printf 'tables=%s\n' "$(public_table_count)"
  for table in $CRITICAL_TABLES; do
    printf 'count_%s=%s\n' "$table" "$(table_count "$table")"
  done
} >"$meta.partial"

pg_dump --format=custom --compress=6 --no-owner --no-acl --file="$partial"
pg_restore --list "$partial" >/dev/null || die "el índice del dump no se puede leer"

printf 'size_bytes=%s\n' "$(wc -c <"$partial" | tr -d ' ')" >>"$meta.partial"
printf 'sha256=%s\n' "$(file_sha256 "$partial")" >>"$meta.partial"

mv "$partial" "$final"
mv "$meta.partial" "$meta"
trap - EXIT

upload_file "$final" "dumps"
upload_file "$meta" "dumps"
if [ -n "${BACKUP_REMOTE:-}" ]; then
  set_status last_offsite_ok "$(now)"
fi

set_status last_dump_ok "$(now)"
log "dump listo: $final ($(wc -c <"$final" | tr -d ' ') bytes)"
