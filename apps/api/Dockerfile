# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
ENV CI=1
RUN corepack enable pnpm

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY configs ./configs
COPY prisma ./prisma
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3003 \
    API_PORT=3003 \
    PNPM_HOME=/pnpm

RUN corepack enable pnpm
RUN mkdir -p /pnpm && chown node:node /pnpm
RUN apk add --no-cache curl

COPY --from=builder --chown=node:node /app /app

USER node
EXPOSE 3003
CMD ["pnpm", "--filter", "api", "start:prod"]
