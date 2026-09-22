# ============================================================
# docker/pagos/Dockerfile
# Microservicio: Pagos y Suscripciones
# ------------------------------------------------------------
# ESTADO: scaffolding (andamiaje) para el Sprint 3, conforme al
# cronograma ya definido (Gantt). Por ahora expone únicamente un
# endpoint de salud (/health); la integración con la pasarela de
# pago (Recurrente / Visanet) y el cobro de suscripciones
# (RF-13 a RF-16) se implementan durante el Sprint 3.
# ============================================================
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY src/pagos/package*.json ./
RUN npm ci --production
COPY src/pagos .

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3004
CMD ["node", "index.js"]
