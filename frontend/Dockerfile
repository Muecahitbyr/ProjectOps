# ---------------------------------------------------------------------------
# Frontend (React/Vite) - Auftragspunkt 7 "Deployment Vorbereitung".
# "builder" baut das statische Production-Bundle, "runtime" serviert es ueber
# ein minimales nginx (kein Node im Runtime-Image noetig). VITE_API_URL wird
# als Build-Arg gesetzt, weil Vite Umgebungsvariablen zur Build-Zeit in das
# Bundle einbrennt (kein Laufzeit-Env moeglich) - in Production zeigt es auf
# denselben Host wie das Frontend selbst (leerer String = relative /api-
# Pfade), da der Reverse Proxy (deploy/nginx) beides unter einer Origin
# ausliefert.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=""
ARG VITE_BASE_PATH=""
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1

EXPOSE 80
