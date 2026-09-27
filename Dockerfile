FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS builder
RUN corepack enable
WORKDIR /app

# Install first with only the manifests, so this layer caches across source-only changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
RUN pnpm --filter @specter/api run build
RUN pnpm --filter=@specter/api deploy --prod /prod/api

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /prod/api/node_modules ./node_modules
COPY --from=builder /prod/api/dist ./dist
COPY --from=builder /prod/api/db ./db
COPY --from=builder /prod/api/public ./public
COPY --from=builder /prod/api/package.json ./package.json

USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
