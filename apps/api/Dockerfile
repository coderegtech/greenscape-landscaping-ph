# syntax=docker/dockerfile:1.7
# Express API. Multi-stage: the build stage has every dependency (Prisma CLI generates the client); the runtime stage
# keeps production dependencies only, runs as the unprivileged `node` user under tini, and holds no secrets: all
# configuration arrives as environment variables at run time (docs/security/infrastructure-security.md).
#   docker build -f apps/api/Dockerfile -t greenscape-api .
#   docker build -f apps/api/Dockerfile --target migrate -t greenscape-migrate .   (one-off: prisma migrate deploy)
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
RUN corepack enable
WORKDIR /repo
COPY . .
# prisma generate reads the datasource URL from config; generation never connects, so a placeholder is enough.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build CI=true
RUN pnpm install --frozen-lockfile --filter "@greenscape/api..." --filter "@greenscape/database"

# Migrations: run once per deploy with the migration role (DDL rights), never by the API process.
FROM build AS migrate
WORKDIR /repo/packages/database
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM ${NODE_IMAGE} AS prod-deps
# A clean install of the API's production graph only: no dev tools, no Next.js (an optional peer of @greenscape/auth, for its
# Next helpers, which the API never imports), scripts skipped; the Prisma client generated above is copied in.
RUN corepack enable
WORKDIR /repo
COPY . .
ENV CI=true
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@greenscape/api..."
COPY --from=build /repo/packages/database/src/generated ./packages/database/src/generated

FROM ${NODE_IMAGE} AS runtime
# The app never runs npm or corepack: remove them (and the CVEs in their bundled dependencies) from the runtime.
RUN apk add --no-cache tini && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production API_PORT=4000
WORKDIR /app
COPY --from=prod-deps --chown=root:root /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=root:root /repo/packages ./packages
COPY --from=prod-deps --chown=root:root /repo/apps/api ./apps/api
COPY --from=prod-deps --chown=root:root /repo/package.json /repo/pnpm-workspace.yaml ./
# Files belong to root and are read-only for the app user; run with --read-only and a tmpfs /tmp.
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:4000/v1/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "--enable-source-maps", "src/server.ts"]
