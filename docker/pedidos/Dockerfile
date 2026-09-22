# ============================================================
# docker/pedidos/Dockerfile
# Microservicio: Gestión de Pedidos
# ------------------------------------------------------------
# ESTADO: scaffolding (andamiaje) para el Sprint 2, conforme al
# cronograma ya definido (Gantt). Por ahora expone únicamente un
# endpoint de salud (/health) para validar que el contenedor y el
# pipeline de CI/CD lo reconocen; la lógica de negocio (RF-04 a
# RF-08) se implementa durante el Sprint 2.
# ============================================================
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY src/pedidos/package*.json ./
RUN npm ci --production
COPY src/pedidos .

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3003
CMD ["node", "index.js"]
