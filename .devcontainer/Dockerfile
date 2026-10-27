FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Cliente do PostgreSQL 16 (pg_dump da mesma versão do servidor), usado só pelo
# backup, do repositório oficial (instruções de postgresql.org/download). Se a
# instalação falhar, o Codespace funciona normalmente e só o backup avisa.
RUN ( install -d /usr/share/postgresql-common/pgdg \
      && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
      && apt-get update \
      && apt-get install -y --no-install-recommends postgresql-client-16 ) \
    || echo "AVISO: cliente do PostgreSQL 16 não instalado; o backup ficará indisponível neste Codespace." ; \
    rm -rf /var/lib/apt/lists/*
