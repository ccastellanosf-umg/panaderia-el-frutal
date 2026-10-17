-- ============================================================
-- db/migrations/2026-10-17_indices_historial_pedidos.sql
-- Indexes for GET /pedidos/mios (order history of a client).
-- PostgreSQL does not index foreign keys automatically; without
-- these, the history filter and the detail lookup scan whole tables.
-- Idempotent: safe to run on every deploy.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pedidos_idcliente
    ON pedidos ("idCliente");

CREATE INDEX IF NOT EXISTS idx_pedidos_idsuscripcion
    ON pedidos ("idSuscripcion");

CREATE INDEX IF NOT EXISTS idx_suscripciones_idcliente
    ON suscripciones ("idCliente");

CREATE INDEX IF NOT EXISTS idx_detalle_pedido_idpedido
    ON detalle_pedido ("idPedido");
