#!/bin/sh
set -eu

: "${DB_MIGRATOR_PASSWORD:?DB_MIGRATOR_PASSWORD es obligatoria}"
: "${DB_APP_PASSWORD:?DB_APP_PASSWORD es obligatoria}"
: "${DB_BACKUP_PASSWORD:?DB_BACKUP_PASSWORD es obligatoria}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v migrator_password="$DB_MIGRATOR_PASSWORD" \
  -v app_password="$DB_APP_PASSWORD" \
  -v backup_password="$DB_BACKUP_PASSWORD" \
  -v db="$POSTGRES_DB" <<'SQL'
CREATE ROLE leonice_migrator LOGIN PASSWORD :'migrator_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE leonice_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE leonice_backup LOGIN PASSWORD :'backup_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE REPLICATION;

GRANT pg_read_all_data TO leonice_backup;
GRANT pg_monitor TO leonice_backup;
GRANT EXECUTE ON FUNCTION pg_switch_wal() TO leonice_backup;

ALTER DATABASE :"db" OWNER TO leonice_migrator;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO leonice_app, leonice_backup;

ALTER SCHEMA public OWNER TO leonice_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO leonice_app;

ALTER DEFAULT PRIVILEGES FOR ROLE leonice_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leonice_app;
ALTER DEFAULT PRIVILEGES FOR ROLE leonice_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO leonice_app;

ALTER ROLE leonice_app SET statement_timeout = '30s';
ALTER ROLE leonice_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE leonice_app SET search_path = public;
SQL

HBA="$PGDATA/pg_hba.conf"
{
  printf '# El superusuario solo entra por el socket local del contenedor\n'
  printf 'host all %s 0.0.0.0/0 reject\n' "$POSTGRES_USER"
  printf 'host all %s ::/0 reject\n' "$POSTGRES_USER"
  printf '# Copias base físicas desde la red interna de Docker\n'
  printf 'host replication leonice_backup 0.0.0.0/0 scram-sha-256\n'
  cat "$HBA"
} >"$HBA.new"
mv "$HBA.new" "$HBA"
