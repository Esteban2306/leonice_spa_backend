#!/bin/sh

BACKUP_DIR="${BACKUP_DIR:-/backups}"
WAL_DIR="${WAL_DIR:-/wal_archive}"
STATUS_DIR="$BACKUP_DIR/status"
CRITICAL_TABLES="clients reservations deposit_records consent_records users"

log() {
  printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${TASK:-backup}" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

now() {
  date +%s
}

ensure_dirs() {
  mkdir -p "$BACKUP_DIR/dumps" "$BACKUP_DIR/base" "$STATUS_DIR"
}

set_status() {
  ensure_dirs
  printf '%s\n' "$2" >"$STATUS_DIR/$1.tmp"
  mv "$STATUS_DIR/$1.tmp" "$STATUS_DIR/$1"
}

get_status() {
  if [ -f "$STATUS_DIR/$1" ]; then
    cat "$STATUS_DIR/$1"
  else
    printf '0\n'
  fi
}

age_of() {
  last=$(get_status "$1")
  printf '%s\n' "$(( $(now) - last ))"
}

latest_migration() {
  psql -X -Atc "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1" 2>/dev/null || true
}

public_table_count() {
  psql -X -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
}

table_count() {
  psql -X -Atc "SELECT count(*) FROM \"$1\""
}

upload_file() {
  [ -n "${BACKUP_REMOTE:-}" ] || return 0
  rclone copy "$1" "$BACKUP_REMOTE/$2" --retries 3 --low-level-retries 5
}

file_sha256() {
  sha256sum "$1" | cut -d' ' -f1
}
