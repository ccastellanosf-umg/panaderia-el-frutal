# ============================================================
# docker/catalogo/Dockerfile
# Microservicio: Catálogo digital (productos, disponibilidad)
# Sprint 1 — Transformación Digital de Panadería El Frutal
# ============================================================
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY src/catalogo/package*.json ./
RUN npm ci
COPY src/catalogo/prisma ./prisma
RUN npx prisma generate
COPY src/catalogo .

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

EXPOSE 3002
# El esquema lo crea db/01_schema.sql vía docker-entrypoint-initdb.d;
# Prisma se usa solo como cliente (nunca ejecuta migraciones aquí).
CMD ["node", "index.js"]
