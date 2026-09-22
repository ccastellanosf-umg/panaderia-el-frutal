# ============================================================
# docker/catalogo/Dockerfile
# Microservicio: Catálogo digital (productos, disponibilidad)
# Sprint 1 — Transformación Digital de Panadería El Frutal
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app
COPY src/catalogo/package*.json ./
RUN npm ci
COPY src/catalogo/prisma ./prisma
RUN npx prisma generate
COPY src/catalogo .

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/middlewares ./middlewares

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3002
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]
