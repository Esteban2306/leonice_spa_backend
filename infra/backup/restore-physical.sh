#!/bin/sh
set -eu
TASK=restore-physical
. /opt/backup/lib.sh

usage() {
  printf 'Uso: restore-physical.sh <directorio_destino_vacio> [fecha_objetivo|latest] [directorio_copia_base|latest]\n' >&2
  printf 'Ejemplo: restore-physical.sh /restore/data "2026-10-17 14:30:00+00"\n' >&2
  exit 2
}

dest="${1:-}"
target="${2:-latest}"
base="${3:-latest}"
[ -n "$dest" ] || usage

if [ "$base" = "latest" ]; then
  base=$(ls -1d "$BACKUP_DIR"/base/base-* 2>/dev/null | grep -v '\.partial$' | sort | tail -n 1 || true)
fi
[ -n "$base" ] && [ -f "$base/base.tar.gz" ] || die "no hay copia base física disponible en $BACKUP_DIR/base"

if [ -d "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
  die "el destino $dest no está vacío"
fi

expected=$(sed -n 's/^sha256=//p' "$base/meta")
actual=$(file_sha256 "$base/base.tar.gz")
[ "$expected" = "$actual" ] || die "el checksum de $base/base.tar.gz no coincide"

mkdir -p "$dest"
chmod 700 "$dest"
tar -xzf "$base/base.tar.gz" -C "$dest"
touch "$dest/recovery.signal"

{
  printf "restore_command = 'cp %s/%%f %%p'\n" "$WAL_DIR"
  printf "recovery_target_timeline = 'latest'\n"
  printf "archive_mode = off\n"
  if [ "$target" != "latest" ]; then
    printf "recovery_target_time = '%s'\n" "$target"
    printf "recovery_target_action = 'promote'\n"
  fi
} >>"$dest/postgresql.auto.conf"

log "copia base $(basename "$base") extraída en $dest (objetivo: $target)"
