# ============================================================
# docker/db/Dockerfile
# CI/staging-only Postgres image for Jenkins pipelines.
#
# Jenkins runs inside a container talking to the HOST Docker
# daemon (mounted socket), so a host-relative bind mount like
# `./db:/docker-entrypoint-initdb.d:ro` (used by the local
# docker-compose.yml) resolves against the Docker Desktop VM,
# not the Jenkins workspace, and fails to find the files.
#
# This image bakes the same init SQL into the image instead, so
# the build context (uploaded by the Docker CLI) is all that is
# needed — no bind mount required.
#
# Only 01_schema.sql and 02_seed.sql are copied: db/migrations/
# holds incremental migrations applied to already-deployed Azure
# databases (see scripts/deploy-azure.sh); 01_schema.sql already
# contains those fixes baked in for a fresh install, so a new
# database created from scratch (CI, staging) never needs them.
# ============================================================
FROM postgres:16-alpine

COPY db/01_schema.sql /docker-entrypoint-initdb.d/01_schema.sql
COPY db/02_seed.sql /docker-entrypoint-initdb.d/02_seed.sql
