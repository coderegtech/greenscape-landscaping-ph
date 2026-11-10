#!/bin/sh
# Least-privilege Postgres roles (runs once, on an empty data directory).
#   greenscape_owner   : owns the database (POSTGRES_USER); used by nobody day to day
#   greenscape_migrate : runs `prisma migrate deploy` (DDL) in the one-off migrate job
#   greenscape_app     : the API at run time: read/write data, no DDL, no role management
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE greenscape_migrate LOGIN PASSWORD '${POSTGRES_MIGRATE_PASSWORD}';
CREATE ROLE greenscape_app LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE ALL ON DATABASE ${POSTGRES_DB} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO greenscape_migrate, greenscape_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO greenscape_migrate;
GRANT USAGE ON SCHEMA public TO greenscape_app;
-- Tables and sequences the migrate role creates are usable by the app role (data only).
ALTER DEFAULT PRIVILEGES FOR ROLE greenscape_migrate IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO greenscape_app;
ALTER DEFAULT PRIVILEGES FOR ROLE greenscape_migrate IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO greenscape_app;
SQL
