# syntax=docker/dockerfile:1.7
# Website (Next.js standalone server), port 3000. Build from the repository root (the workspace packages are needed):
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... -t greenscape-web .
# The web, admin and employee Dockerfiles differ only in this header, the APP/PORT defaults and the
# public/ copy (admin and employee ship app icons; web has no public folder): change all three together.
# NEXT_PUBLIC_* values are public by definition (they ship to browsers) and are baked in at build time. Server secrets
# (SUPABASE_SECRET_KEY is not used by these apps; REVALIDATE_SECRET, PREVIEW_SECRET, INTERNAL_API_KEY) are
# runtime environment variables only, never build args.
# The website pre-renders CMS pages at build time: NEXT_PUBLIC_API_URL must be reachable from the build, or `next build`
# fails collecting page data (the [slug] routes list their pages from the CMS).
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
ARG APP=web
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_AUTH_GOOGLE=false
RUN corepack enable
WORKDIR /repo
COPY . .
ENV CI=true NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=postgresql://build:build@localhost:5432/build \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY} NEXT_PUBLIC_AUTH_GOOGLE=${NEXT_PUBLIC_AUTH_GOOGLE}
RUN pnpm install --frozen-lockfile --filter "@greenscape/${APP}..."
RUN pnpm --filter "@greenscape/${APP}" build

FROM ${NODE_IMAGE} AS runtime
ARG APP=web
ARG PORT=3000
# The app never runs npm or corepack: remove them (and the CVEs in their bundled dependencies) from the runtime.
RUN apk add --no-cache tini && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=${PORT} HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone output: server.js plus only the files it traces; static assets copied beside it. Owned by root,
# read-only for the app user (run with --read-only; Next's image cache needs a writable /app/apps/APP/.next/cache).
COPY --from=build --chown=root:root /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=root:root /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
RUN mkdir -p ./apps/${APP}/.next/cache && chown node:node ./apps/${APP}/.next/cache
ENV APP_DIR=/app/apps/${APP}
USER node
EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "exec node \"$APP_DIR/server.js\""]
