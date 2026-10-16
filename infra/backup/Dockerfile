FROM postgres:18-alpine

RUN apk add --no-cache rclone tzdata

COPY --chmod=0755 lib.sh pg-dump.sh pg-basebackup.sh wal-sync.sh prune.sh restore-physical.sh restore-verify.sh healthcheck.sh entrypoint.sh /opt/backup/

USER postgres
ENTRYPOINT ["/opt/backup/entrypoint.sh"]
