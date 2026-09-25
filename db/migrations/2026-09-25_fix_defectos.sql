-- ============================================================
-- Migración: 2026-09-25_fix_defectos.sql
-- Corrige DEF-04 y DEF-06 (docs/defectos/defectos.md) a nivel de
-- base de datos, sin perder datos existentes. Idempotente: puede
-- ejecutarse varias veces sin error.
-- ============================================================

-- DEF-06: unicidad de correo insensible a mayúsculas/minúsculas.
-- Antes de crear el índice, deja constancia de si hay duplicados
-- existentes que impedirían crearlo (no se borran datos: si falla,
-- hay que resolver los duplicados manualmente antes de reintentar).
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_correo_lower
    ON usuarios (LOWER("correo"));

-- DEF-04: no permitir cobrar una suscripción que no esté 'activa'
-- (cancelada o pausada). CREATE OR REPLACE conserva permisos y no
-- afecta las filas ya existentes en suscripciones/pagos.
CREATE OR REPLACE PROCEDURE sp_procesar_cobro_suscripcion(
    IN "p_idSuscripcion"      INT,
    IN "p_resultadoPasarela"  VARCHAR(20)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_idPlan           INT;
    v_idCliente        INT;
    v_monto            DECIMAL(10,2);
    v_fechaCobroActual TIMESTAMP;
    v_estado           VARCHAR(20);
BEGIN
    SELECT "idPlan", "idCliente", "fechaCobro", "estado"
    INTO v_idPlan, v_idCliente, v_fechaCobroActual, v_estado
    FROM suscripciones
    WHERE "idSuscripcion" = "p_idSuscripcion";

    -- DEF-04: no se puede cobrar una suscripción que no esté activa
    -- (cancelada o pausada). Defensa en profundidad: el endpoint
    -- también valida esto antes de invocar el procedimiento.
    IF v_estado IS DISTINCT FROM 'activa' THEN
        RAISE EXCEPTION 'La suscripción no está activa; no se puede procesar el cobro.';
    END IF;

    SELECT "precio" INTO v_monto
    FROM planes
    WHERE "idPlan" = v_idPlan;

    IF "p_resultadoPasarela" = 'aprobado' THEN
        INSERT INTO pagos
            ("idSuscripcion", "monto", "fecha", "metodo", "estado")
        VALUES
            ("p_idSuscripcion", v_monto, CURRENT_DATE,
             'pasarela', 'aprobado');

        UPDATE suscripciones
        SET "fechaCobro" =
            fn_proxima_fecha_cobro(v_idPlan, v_fechaCobroActual)
        WHERE "idSuscripcion" = "p_idSuscripcion";
    ELSE
        INSERT INTO pagos
            ("idSuscripcion", "monto", "fecha", "metodo", "estado")
        VALUES
            ("p_idSuscripcion", v_monto, CURRENT_DATE,
             'pasarela', 'rechazado');

        UPDATE suscripciones
        SET "estado" = 'pausada'
        WHERE "idSuscripcion" = "p_idSuscripcion";

        INSERT INTO notificaciones
            ("idCliente", "canal", "mensaje", "tipo", "estado")
        VALUES
            (v_idCliente, 'whatsapp',
             'Tu cobro de suscripción fue rechazado y tu suscripción quedó pausada.',
             'cobro_rechazado', 'enviada');
    END IF;
END;
$$;
