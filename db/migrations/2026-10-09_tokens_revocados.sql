-- ============================================================
-- Migración: 2026-10-09_tokens_revocados.sql
-- Corrige DEF-03 (docs/defectos/defectos.md): lista de tokens
-- revocados en PostgreSQL, compartida por auth/catalogo/pedidos/pagos
-- (antes solo vivía en Redis, que no existe en Azure).
-- Idempotente: puede ejecutarse varias veces sin error.
-- ============================================================
CREATE TABLE IF NOT EXISTS tokens_revocados (
    "jti"    TEXT PRIMARY KEY,
    "expira" TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_revocados_expira
    ON tokens_revocados ("expira");
