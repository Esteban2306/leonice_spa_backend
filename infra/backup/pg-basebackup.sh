#!/bin/sh
set -eu
TASK=basebackup
. /opt/backup/lib.sh
ensure_dirs

stamp=$(date -u +%Y%m%d-%H%M%S)
final="$BACKUP_DIR/base/base-$stamp"
partial="$final.partial"
trap 'rm -rf "$partial"' EXIT
mkdir -p "$partial"

label="leonice-$stamp"
log "iniciando copia base física $label"
pg_basebackup --pgdata="$partial" --format=tar --gzip --wal-method=none \
  --checkpoint=fast --label="$label" --no-password

history=""
attempts=0
while [ "$attempts" -lt 60 ]; do
  history=$(grep -l "LABEL: $label" "$WAL_DIR"/*.backup 2>/dev/null | head -n 1 || true)
  [ -n "$history" ] && break
  psql -X -Atc "SELECT pg_switch_wal()" >/dev/null 2>&1 || true
  attempts=$((attempts + 1))
  sleep 2
done
[ -n "$history" ] || die "el archivo de historia de la copia base no llegó al archivo WAL"

basename "$history" >"$partial/backup_history_file"
{
  printf 'taken_at=%s\n' "$(now)"
  printf 'migration=%s\n' "$(latest_migration)"
  printf 'sha256=%s\n' "$(file_sha256 "$partial/base.tar.gz")"
} >"$partial/meta"

mv "$partial" "$final"
trap - EXIT

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$final" "$BACKUP_REMOTE/base/$(basename "$final")" --retries 3 --low-level-retries 5
  set_status last_offsite_ok "$(now)"
fi

set_status last_base_ok "$(now)"
log "copia base lista: $final"
