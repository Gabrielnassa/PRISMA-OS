#!/usr/bin/env bash
# Cria papéis e bancos para desenvolvimento local (requer acesso de superusuário ao PostgreSQL).
# Uso: PGUSER=postgres ./scripts/setup-local-db.sh
# Senhas padrão são apenas para desenvolvimento; troque-as em qualquer ambiente compartilhado.
set -euo pipefail

OWNER_PASSWORD="${OWNER_PASSWORD:-prisma_owner_dev}"
APP_PASSWORD="${APP_PASSWORD:-prisma_app_dev}"

psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_owner') THEN
    CREATE ROLE prisma_owner LOGIN CREATEROLE PASSWORD '${OWNER_PASSWORD}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_app_login') THEN
    CREATE ROLE prisma_app_login LOGIN PASSWORD '${APP_PASSWORD}';
  END IF;
END
\$\$;
SQL

for db in prisma_os prisma_os_test prisma_os_e2e; do
  if ! psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db}'" | grep -q 1; then
    psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${db} OWNER prisma_owner"
  fi
done
echo "Papéis e bancos prontos. Agora rode: npm run db:migrate"
