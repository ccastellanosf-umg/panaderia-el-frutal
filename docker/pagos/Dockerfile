# ============================================================
# docker/pagos/Dockerfile
# Microservicio: Pagos y Suscripciones — RF-13..16, RF-20
# ============================================================
FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY src/pagos/package*.json ./
RUN npm ci --omit=dev
COPY src/pagos .

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3004
# El esquema lo crea db/01_schema.sql vía docker-entrypoint-initdb.d.
CMD ["node", "index.js"]
