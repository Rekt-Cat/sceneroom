# The collab server as a container (step M9). Build from the REPOSITORY ROOT:
#   docker build -f apps/collab-server/Dockerfile -t sceneroom-collab .
# Run it (the settings are environment variables, see apps/collab-server/.env.example):
#   docker run -p 1234:1234 -e HOST=0.0.0.0 -e COLLAB_SECRET=... -e ALLOWED_ORIGINS=https://your-site -v collab-data:/data sceneroom-collab
FROM node:24-alpine

# pnpm at the version the repository pins (package.json "packageManager")
RUN corepack enable
WORKDIR /repo

# Dependencies first, from the lockfile and the package files only, so this layer is reused until they change
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/collab-server/package.json apps/collab-server/
COPY packages/shared/package.json packages/shared/
COPY packages/link-token/package.json packages/link-token/
RUN pnpm install --frozen-lockfile --filter @sceneroom/collab-server...

# Then the code the server runs (TypeScript is run directly by tsx, as in development)
COPY packages/shared packages/shared
COPY packages/link-token packages/link-token
COPY apps/collab-server apps/collab-server

# Files and the SQLite file live on the volume at /data, so they survive a new container
ENV HOST=0.0.0.0 \
    PORT=1234 \
    DB_PATH=/data/collab.sqlite \
    FILES_DIR=/data/files \
    NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 1234
# The host's health check: the server answers GET /health
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

WORKDIR /repo/apps/collab-server
CMD ["pnpm", "start"]
