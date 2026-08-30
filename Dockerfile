# ---------------------------------------------------------------------------
# Build stage: compile the shared package, the API and the frontend bundle.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Manifests first, so a source-only change reuses the installed layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
RUN npm run build

# Drop dev dependencies from the tree that ships.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Runtime stage: the API process, serving its own frontend build.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    SERVE_WEB=true \
    API_PORT=3000 \
    STORAGE_LOCAL_ROOT=/data/objects \
    DATA_DIR=/data/db

WORKDIR /app

# tini reaps zombies and forwards signals, so the container stops cleanly.
RUN apk add --no-cache tini \
    && mkdir -p /data/objects /data/db \
    && chown -R node:node /data

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/index.js"]
