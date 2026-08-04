# ---------- Build de dependências (monorepo workspaces) ----------
FROM node:22-alpine AS deps
WORKDIR /app

# Copia os manifests do workspace (raiz + shared + api + web p/ lockfile)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci

# ---------- Código + runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

EXPOSE 4000

CMD ["npx", "tsx", "apps/api/src/index.ts"]
