#!/usr/bin/env bash
# Executado pela imagem oficial do PostgreSQL na primeira inicialização.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE prisma_owner LOGIN CREATEROLE PASSWORD '${PRISMA_OWNER_PASSWORD}';
CREATE ROLE prisma_app_login LOGIN PASSWORD '${PRISMA_APP_PASSWORD}';
CREATE DATABASE prisma_os OWNER prisma_owner;
CREATE DATABASE prisma_os_test OWNER prisma_owner;
CREATE DATABASE prisma_os_e2e OWNER prisma_owner;
SQL
