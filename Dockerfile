# Imagem única do PRISMA OS: o mesmo código roda o site (`npm start`), o worker
# (`npm run worker`) e as migrations (`npm run db:migrate`).
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    TZ=America/Sao_Paulo

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build \
 && mkdir -p /app/storage \
 && chown -R node:node /app/storage /app/.next

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "start"]
