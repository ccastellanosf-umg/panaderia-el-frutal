# ============================================================
# docker/e2e/Dockerfile
# CI-only image that runs the E2E suite (tests/e2e) from inside
# the compose network, so it can reach the microservices by their
# service DNS names (auth, catalogo, pedidos, pagos) instead of
# localhost — the Jenkins container is not on the host network
# where docker-compose.yml publishes those ports.
# ============================================================
FROM node:20-alpine

WORKDIR /app
# Runs as the unprivileged "node" user; it owns /app so the reporters can
# write test-results/ (scripts/ci/e2e.sh copies it out of the container).
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY --chown=node:node tests ./tests

ENV NODE_ENV=test

CMD ["./node_modules/.bin/jest", "--config", "tests/e2e/jest.e2e.config.js"]
