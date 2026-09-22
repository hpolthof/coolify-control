# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

RUN npm ci

FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig.base.json ./

RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    WEB_DIR=/app/web

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./server/dist
COPY --from=build /app/apps/server/package.json ./server/
COPY --from=build /app/apps/web/dist ./web

RUN mkdir -p /data && chown node:node /data

USER node

VOLUME /data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "/app/server/dist/index.js"]
