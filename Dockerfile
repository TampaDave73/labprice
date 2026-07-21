# Stage 1: base
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Stage 2: deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/scrapers/package.json ./packages/scrapers/package.json
RUN pnpm install --frozen-lockfile

# Stage 3: builder
FROM base AS builder
COPY --from=deps /app/ ./
COPY . .
RUN pnpm --filter @labprice/database exec prisma generate
# NEXT_PUBLIC_* vars used in CLIENT code get inlined into the bundle by `next build`, which runs in
# THIS Docker build step — Railway's dashboard Variables are only injected into the running
# container at deploy time, not into `docker build`, so without this ARG the client bundle silently
# bakes in `undefined` (found live 2026-07-21: NEXT_PUBLIC_GA_MEASUREMENT_ID was set in Railway, GA's
# script tag loaded fine — server-rendered, so it read the live runtime env var correctly — but the
# CLIENT never called gtag()/populated dataLayer, since ITS build baked in `undefined` and bailed).
# Any FUTURE NEXT_PUBLIC_* var read in a 'use client' component needs the same ARG + ENV pair here.
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID
RUN pnpm build

# Stage 4a: worker
# Runs via tsx (no compile step) — the worker has pre-existing ioredis dual-version type errors that
# block `tsc`, and it already runs under tsx in dev. tsx executes the TS source directly.
# (Defined BEFORE `web` on purpose: `web` is the LAST stage, so a plain `docker build` / Railway build
# with no --target produces the web image. Build the worker with `--target worker`.)
FROM base AS worker
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 worker
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker ./apps/worker
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
USER worker
# pnpm doesn't hoist workspace bins to the root .bin — run from the package (see Dockerfile.worker).
WORKDIR /app/apps/worker
CMD ["pnpm", "exec", "tsx", "src/index.ts"]

# Stage 4b: web (DEFAULT/final stage — Railway builds this with zero target config).
# Runs a normal `next start` over the FULL build, NOT Next's standalone server: the standalone
# file-tracer drops Prisma's generated client + query engine in this pnpm monorepo, which breaks every
# DB call at runtime (`database: down`). Copying the whole /app keeps @prisma/client + the linux engine
# present. Larger image, but reliable. Listens on $PORT (Railway sets it) bound to 0.0.0.0.
FROM base AS web
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder /app ./
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0"]
