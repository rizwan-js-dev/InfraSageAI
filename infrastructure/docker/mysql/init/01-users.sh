#!/bin/bash
# Runs once, on first initialisation of the mysql-data volume (docker-entrypoint-initdb.d).
# Creates least-privilege users (PLAN §5). To re-run: `docker compose down -v` (wipes data).
#
#   infrasage_migrator  DDL on the app schema (used only by `pnpm db:migrate`), WITH GRANT OPTION so
#                       migrations can grant the read-only user table-level SELECT once tables exist.
#   infrasage_app       SELECT/INSERT/UPDATE/DELETE on the app schema, no DDL (used by the API).
#   infrasage_ro        no table privileges yet; Phase 2 migrations grant SELECT on
#                       resources, scenario_runs and scenario_definitions only (used by the MCP server).
set -euo pipefail

identifier='^[A-Za-z0-9_]{1,32}$'
# Restricting the password alphabet means values can be embedded in SQL without escaping.
password='^[A-Za-z0-9_.~+=-]{8,128}$'

for var in MYSQL_DATABASE MYSQL_APP_USER MYSQL_RO_USER MYSQL_MIGRATOR_USER; do
  if [[ ! "${!var:-}" =~ $identifier ]]; then
    echo "01-users.sh: $var must match $identifier" >&2
    exit 1
  fi
done
for var in MYSQL_APP_PASSWORD MYSQL_RO_PASSWORD MYSQL_MIGRATOR_PASSWORD; do
  if [[ ! "${!var:-}" =~ $password ]]; then
    echo "01-users.sh: $var must be 8-128 chars of [A-Za-z0-9_.~+=-]" >&2
    exit 1
  fi
done

MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket -uroot <<SQL
CREATE USER IF NOT EXISTS '${MYSQL_MIGRATOR_USER}'@'%' IDENTIFIED BY '${MYSQL_MIGRATOR_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_MIGRATOR_USER}'@'%' WITH GRANT OPTION;

CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_APP_USER}'@'%';

CREATE USER IF NOT EXISTS '${MYSQL_RO_USER}'@'%' IDENTIFIED BY '${MYSQL_RO_PASSWORD}';

FLUSH PRIVILEGES;
SQL

echo "01-users.sh: created ${MYSQL_MIGRATOR_USER}, ${MYSQL_APP_USER}, ${MYSQL_RO_USER}"
