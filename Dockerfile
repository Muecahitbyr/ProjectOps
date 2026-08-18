# ---------------------------------------------------------------------------
# Backend (Express/TypeScript) - Auftragspunkt 7 "Deployment Vorbereitung".
# Multi-Stage-Build: "builder" installiert alle Dependencies (inkl. dev, fuer
# tsc) und kompiliert nach dist/, "runtime" enthaelt nur Produktions-
# Dependencies + kompiliertes JS + die SQL-Migrationen (db/migrations wird
# zur Laufzeit von db/migrate.ts gelesen, siehe CMD unten - nicht Teil des
# tsc-Outputs).
# ---------------------------------------------------------------------------

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY db ./db

# Nicht als root laufen.
RUN addgroup -S projectops && adduser -S projectops -G projectops
USER projectops

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrationen sind ueber schema_migrations idempotent (siehe db/migrate.ts) -
# bei jedem Start gefahrlos erneut ausfuehrbar, keine separate Init-
# Container-Choreografie noetig.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
