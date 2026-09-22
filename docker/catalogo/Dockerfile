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
COPY --from=builder --chown=appuser:appgroup /app/index.js ./
COPY --from=builder --chown=appuser:appgroup /app/routes ./routes
COPY --from=builder --chown=appuser:appgroup /app/middlewares ./middlewares

USER appuser

EXPOSE 3002
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]
