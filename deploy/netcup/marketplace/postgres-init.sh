#!/usr/bin/env bash
set -euo pipefail
# Executed only for a new, empty Postgres volume. Values stay in the process
# environment and are quoted by psql, never interpolated as SQL source.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password MARKETPLACE_APP_DB_PASSWORD
CREATE ROLE marketplace LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
CREATE DATABASE marketplace OWNER marketplace;
SQL
