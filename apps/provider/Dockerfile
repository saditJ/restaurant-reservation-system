# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat && corepack enable pnpm

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps ./apps
COPY packages ./packages
COPY configs ./configs
COPY prisma ./prisma
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile
RUN pnpm --filter provider build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3004 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache libc6-compat && corepack enable pnpm

COPY --from=builder /app /app

USER node
WORKDIR /app/apps/provider
EXPOSE 3004
CMD ["node_modules/.bin/next","start","-p","3004"]
