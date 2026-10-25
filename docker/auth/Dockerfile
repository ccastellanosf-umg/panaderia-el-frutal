# ============================================================
# docker/auth/Dockerfile
# Microservicio: Autenticación (registro, login, JWT)
# Sprint 1 — Transformación Digital de Panadería El Frutal
# ============================================================
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY src/auth/package*.json ./
RUN npm ci --ignore-scripts
COPY src/auth/prisma ./prisma
# --ignore-scripts omite el postinstall de Prisma: se genera el cliente explícitamente.
RUN ./node_modules/.bin/prisma generate
COPY src/auth .

FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/package*.json ./
COPY --from=builder --chown=appuser:appgroup /app/app.js ./
COPY --from=builder --chown=appuser:appgroup /app/index.js ./
COPY --from=builder --chown=appuser:appgroup /app/routes ./routes
COPY --from=builder --chown=appuser:appgroup /app/middlewares ./middlewares
COPY --from=builder --chown=appuser:appgroup /app/lib ./lib

USER appuser

EXPOSE 3001
# El esquema lo crea db/01_schema.sql vía docker-entrypoint-initdb.d;
# Prisma se usa solo como cliente (nunca ejecuta migraciones aquí).
CMD ["node", "index.js"]
