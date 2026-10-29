# ============================================================
# docker/pedidos/Dockerfile
# Microservicio: Gestión de Pedidos e Inventario — RF-04..12, RF-17..20
# ============================================================
FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY src/pedidos/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src/pedidos .

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3003
# El esquema lo crea db/01_schema.sql vía docker-entrypoint-initdb.d.
CMD ["node", "index.js"]
