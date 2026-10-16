#!/bin/sh
set -eu
TASK=wal-sync
. /opt/backup/lib.sh

[ -n "${BACKUP_REMOTE:-}" ] || exit 0
rclone copy "$WAL_DIR" "$BACKUP_REMOTE/wal" --retries 3 --low-level-retries 5 --exclude "*.tmp"
set_status last_wal_sync_ok "$(now)"
