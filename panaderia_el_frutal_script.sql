-- ============================================================
-- BASE DE DATOS: TRANSFORMACIÓN DIGITAL DE PANADERÍA EL FRUTAL
-- Motor: PostgreSQL
-- Grupo 3 · Seminario de Trabajo de Graduación
-- Universidad Mariano Gálvez de Guatemala
-- ============================================================
-- Los nombres de columnas se mantienen en camelCase (entre comillas
-- dobles) para conservar exactamente los nombres ya definidos en el
-- Diccionario de Datos del Modelo Relacional de Base de Datos.
-- ============================================================


-- ============================================================
-- 1. TABLAS
-- ============================================================

-- 1.1 usuarios: cuenta base de todo usuario del sistema
CREATE TABLE usuarios (
    "idUsuario"       SERIAL PRIMARY KEY,
    "nombre"          VARCHAR(100) NOT NULL,
    "correo"          VARCHAR(150) NOT NULL UNIQUE,
    "contrasenaHash"  VARCHAR(255) NOT NULL,
    "rol"             VARCHAR(20)  NOT NULL
        CHECK ("rol" IN ('administrador', 'operador', 'cliente')),
    "fechaRegistro"   DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 1.2 clientes: extiende a usuarios con los datos de la clientela
CREATE TABLE clientes (
    "idCliente"    SERIAL PRIMARY KEY,
    "idUsuario"    INT NOT NULL UNIQUE REFERENCES usuarios
        ("idUsuario") ON DELETE CASCADE,
    "telefono"     VARCHAR(15),
    "direccion"    VARCHAR(200),
    "tipoCliente"  VARCHAR(20) NOT NULL DEFAULT 'ocasional'
        CHECK ("tipoCliente" IN ('suscriptor', 'ocasional'))
);

-- 1.3 personal: extiende a usuarios con los datos del personal
CREATE TABLE personal (
    "idPersonal"  SERIAL PRIMARY KEY,
    "idUsuario"   INT NOT NULL UNIQUE REFERENCES usuarios
        ("idUsuario") ON DELETE CASCADE,
    "area"        VARCHAR(50) NOT NULL
        CHECK ("area" IN ('produccion', 'ventas'))
);

-- 1.4 planes: catálogo de planes de suscripción
CREATE TABLE planes (
    "idPlan"      SERIAL PRIMARY KEY,
    "nombre"      VARCHAR(50) NOT NULL,
    "frecuencia"  VARCHAR(20) NOT NULL
        CHECK ("frecuencia" IN
            ('diario', 'tres_semanales', 'fin_de_semana')),
    "precio"      DECIMAL(10,2) NOT NULL CHECK ("precio" >= 0)
);

-- 1.5 productos: catálogo digital de productos
CREATE TABLE productos (
    "idProducto"      SERIAL PRIMARY KEY,
    "nombre"          VARCHAR(100) NOT NULL,
    "descripcion"     TEXT,
    "precio"          DECIMAL(10,2) NOT NULL CHECK ("precio" >= 0),
    "disponibilidad"  BOOLEAN NOT NULL DEFAULT TRUE,
    "fotoUrl"         VARCHAR(255)
);

-- 1.6 insumos: control de insumos utilizados en la producción
CREATE TABLE insumos (
    "idInsumo"            SERIAL PRIMARY KEY,
    "nombre"              VARCHAR(100) NOT NULL,
    "cantidadDisponible"  DECIMAL(10,2) NOT NULL DEFAULT 0
        CHECK ("cantidadDisponible" >= 0),
    "nivelMinimo"         DECIMAL(10,2) NOT NULL DEFAULT 0
        CHECK ("nivelMinimo" >= 0),
    "unidadMedida"        VARCHAR(20) NOT NULL
);

-- 1.7 producto_insumo: tabla puente (receta de producción)
CREATE TABLE producto_insumo (
    "idProducto"         INT NOT NULL REFERENCES productos
        ("idProducto") ON DELETE CASCADE,
    "idInsumo"           INT NOT NULL REFERENCES insumos
        ("idInsumo") ON DELETE CASCADE,
    "cantidadRequerida"  DECIMAL(10,2) NOT NULL
        CHECK ("cantidadRequerida" > 0),
    PRIMARY KEY ("idProducto", "idInsumo")
);

-- 1.8 suscripciones: registro de suscripciones contratadas
CREATE TABLE suscripciones (
    "idSuscripcion"  SERIAL PRIMARY KEY,
    "idCliente"      INT NOT NULL REFERENCES clientes
        ("idCliente") ON DELETE CASCADE,
    "idPlan"         INT NOT NULL REFERENCES planes ("idPlan"),
    "fechaInicio"    DATE NOT NULL DEFAULT CURRENT_DATE,
    "fechaCobro"     DATE NOT NULL,
    "estado"         VARCHAR(20) NOT NULL DEFAULT 'activa'
        CHECK ("estado" IN ('activa', 'pausada', 'cancelada'))
);

-- 1.9 pedidos: pedidos ocasionales o derivados de una suscripción
-- Regla de integridad (3FN): un pedido tiene exactamente un origen.
-- "idCliente" se completa solo en pedidos ocasionales; en pedidos
-- derivados de una suscripción, el cliente se obtiene de forma
-- transitiva a través de "idSuscripcion" -> suscripciones.idCliente,
-- evitando almacenar dos veces el mismo dato (observación del
-- catedrático sobre dependencia transitiva).
CREATE TABLE pedidos (
    "idPedido"       SERIAL PRIMARY KEY,
    "idCliente"      INT REFERENCES clientes ("idCliente"),
    "idSuscripcion"  INT REFERENCES suscripciones ("idSuscripcion"),
    "fecha"          DATE NOT NULL DEFAULT CURRENT_DATE,
    "estado"         VARCHAR(20) NOT NULL DEFAULT 'recibido'
        CHECK ("estado" IN
            ('recibido', 'en_preparacion', 'listo',
             'entregado', 'cancelado')),
    "tipo"           VARCHAR(20) NOT NULL
        CHECK ("tipo" IN ('ocasional', 'suscripcion')),
    "total"          DECIMAL(10,2) NOT NULL DEFAULT 0
        CHECK ("total" >= 0),
    CHECK (
        (("idCliente" IS NOT NULL)::INT
         + ("idSuscripcion" IS NOT NULL)::INT) = 1
    )
);

-- 1.10 detalle_pedido: detalle de productos por pedido
CREATE TABLE detalle_pedido (
    "idDetalle"   SERIAL PRIMARY KEY,
    "idPedido"    INT NOT NULL REFERENCES pedidos
        ("idPedido") ON DELETE CASCADE,
    "idProducto"  INT NOT NULL REFERENCES productos ("idProducto"),
    "cantidad"    INT NOT NULL CHECK ("cantidad" > 0),
    "subtotal"    DECIMAL(10,2) NOT NULL CHECK ("subtotal" >= 0)
);

-- 1.11 pagos: pagos procesados por la pasarela de pago
CREATE TABLE pagos (
    "idPago"         SERIAL PRIMARY KEY,
    "idPedido"       INT REFERENCES pedidos ("idPedido"),
    "idSuscripcion"  INT REFERENCES suscripciones ("idSuscripcion"),
    "monto"          DECIMAL(10,2) NOT NULL CHECK ("monto" >= 0),
    "fecha"          DATE NOT NULL DEFAULT CURRENT_DATE,
    "metodo"         VARCHAR(30) NOT NULL,
    "estado"         VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK ("estado" IN ('aprobado', 'rechazado', 'pendiente')),
    CHECK ("idPedido" IS NOT NULL OR "idSuscripcion" IS NOT NULL)
);

-- 1.12 notificaciones: notificaciones enviadas por WhatsApp Business
-- Regla de integridad (3FN): igual que en pedidos, si la notificación
-- corresponde a un pedido, el cliente destinatario ya es deducible a
-- través de dicho pedido; "idCliente" solo se completa cuando
-- la notificación no está asociada a ningún pedido (p. ej. confirmación
-- de una suscripción).
CREATE TABLE notificaciones (
    "idNotificacion"  SERIAL PRIMARY KEY,
    "idPedido"        INT REFERENCES pedidos ("idPedido"),
    "idCliente"       INT REFERENCES clientes ("idCliente"),
    "canal"           VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    "fechaEnvio"      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado"          VARCHAR(20) NOT NULL DEFAULT 'enviada'
        CHECK ("estado" IN ('enviada', 'entregada', 'fallida')),
    CHECK (
        (("idPedido" IS NOT NULL)::INT
         + ("idCliente" IS NOT NULL)::INT) = 1
    )
);

-- Índices sobre campos de consulta frecuente (RNF-01)
CREATE INDEX idx_pedidos_estado
    ON pedidos ("estado");
CREATE INDEX idx_suscripciones_fechacobro
    ON suscripciones ("fechaCobro");
CREATE INDEX idx_productos_disponibilidad
    ON productos ("disponibilidad");


-- ============================================================
-- 2. FUNCIONES
-- ============================================================

-- 2.1 Calcula el total de un pedido a partir de su detalle
CREATE OR REPLACE FUNCTION fn_calcular_total_pedido(
    "p_idPedido" INT
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_total DECIMAL(10,2);
BEGIN
    SELECT COALESCE(SUM("subtotal"), 0)
    INTO v_total
    FROM detalle_pedido
    WHERE "idPedido" = "p_idPedido";

    RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- 2.2 Verifica si un insumo alcanzó su nivel mínimo (RN-05)
CREATE OR REPLACE FUNCTION fn_verificar_nivel_minimo(
    "p_idInsumo" INT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_disponible DECIMAL(10,2);
    v_minimo     DECIMAL(10,2);
BEGIN
    SELECT "cantidadDisponible", "nivelMinimo"
    INTO v_disponible, v_minimo
    FROM insumos
    WHERE "idInsumo" = "p_idInsumo";

    RETURN v_disponible <= v_minimo;
END;
$$ LANGUAGE plpgsql;

-- 2.3 Calcula la próxima fecha de cobro según la frecuencia
CREATE OR REPLACE FUNCTION fn_proxima_fecha_cobro(
    "p_idPlan" INT,
    "p_fechaBase" DATE
)
RETURNS DATE AS $$
DECLARE
    v_frecuencia VARCHAR(20);
BEGIN
    SELECT "frecuencia" INTO v_frecuencia
    FROM planes
    WHERE "idPlan" = "p_idPlan";

    RETURN CASE v_frecuencia
        WHEN 'diario' THEN
            "p_fechaBase" + INTERVAL '1 day'
        WHEN 'tres_semanales' THEN
            "p_fechaBase" + INTERVAL '2 day'
        WHEN 'fin_de_semana' THEN
            "p_fechaBase" + INTERVAL '7 day'
        ELSE
            "p_fechaBase" + INTERVAL '7 day'
    END;
END;
$$ LANGUAGE plpgsql;


-- 2.4 Resuelve el cliente de un pedido sin importar su origen
-- (ocasional -> idCliente directo; suscripción -> vía idSuscripcion),
-- evitando repetir en cada consulta la lógica de resolución.
CREATE OR REPLACE FUNCTION fn_cliente_de_pedido(
    "p_idPedido" INT
)
RETURNS INT AS $$
DECLARE
    v_idCliente INT;
BEGIN
    SELECT COALESCE(p."idCliente", s."idCliente")
    INTO v_idCliente
    FROM pedidos p
    LEFT JOIN suscripciones s
           ON s."idSuscripcion" = p."idSuscripcion"
    WHERE p."idPedido" = "p_idPedido";

    RETURN v_idCliente;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 3. DISPARADORES (TRIGGERS)
-- ============================================================

-- 3.1 Actualiza el total del pedido al cambiar su detalle
CREATE OR REPLACE FUNCTION trg_fn_actualizar_total_pedido()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE pedidos
        SET "total" = fn_calcular_total_pedido(OLD."idPedido")
        WHERE "idPedido" = OLD."idPedido";
    ELSE
        UPDATE pedidos
        SET "total" = fn_calcular_total_pedido(NEW."idPedido")
        WHERE "idPedido" = NEW."idPedido";
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_total_pedido
AFTER INSERT OR UPDATE OR DELETE ON detalle_pedido
FOR EACH ROW EXECUTE FUNCTION trg_fn_actualizar_total_pedido();

-- 3.2 Descuenta insumos del inventario según receta (RF-10)
CREATE OR REPLACE FUNCTION trg_fn_descontar_inventario()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE insumos i
    SET "cantidadDisponible" = i."cantidadDisponible"
        - (pi."cantidadRequerida" * NEW."cantidad")
    FROM producto_insumo pi
    WHERE pi."idInsumo" = i."idInsumo"
      AND pi."idProducto" = NEW."idProducto";

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_descontar_inventario
AFTER INSERT ON detalle_pedido
FOR EACH ROW EXECUTE FUNCTION trg_fn_descontar_inventario();

-- 3.3 Impide agregar un producto no disponible al pedido
CREATE OR REPLACE FUNCTION trg_fn_validar_disponibilidad()
RETURNS TRIGGER AS $$
DECLARE
    v_disponible BOOLEAN;
BEGIN
    SELECT "disponibilidad" INTO v_disponible
    FROM productos
    WHERE "idProducto" = NEW."idProducto";

    IF NOT v_disponible THEN
        RAISE EXCEPTION
            'El producto % no está disponible', NEW."idProducto";
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_disponibilidad
BEFORE INSERT ON detalle_pedido
FOR EACH ROW EXECUTE FUNCTION trg_fn_validar_disponibilidad();

-- 3.4 Garantiza la secuencia válida de estados (RN-04)
CREATE OR REPLACE FUNCTION trg_fn_validar_secuencia_estado()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."estado" = 'recibido'
       AND NEW."estado" NOT IN ('en_preparacion', 'cancelado')
    THEN
        RAISE EXCEPTION
            'Transición no permitida: % -> %',
            OLD."estado", NEW."estado";
    ELSIF OLD."estado" = 'en_preparacion'
          AND NEW."estado" <> 'listo'
    THEN
        RAISE EXCEPTION
            'Transición no permitida: % -> %',
            OLD."estado", NEW."estado";
    ELSIF OLD."estado" = 'listo'
          AND NEW."estado" <> 'entregado'
    THEN
        RAISE EXCEPTION
            'Transición no permitida: % -> %',
            OLD."estado", NEW."estado";
    ELSIF OLD."estado" IN ('entregado', 'cancelado')
          AND NEW."estado" <> OLD."estado"
    THEN
        RAISE EXCEPTION
            'El pedido % ya está en un estado final',
            OLD."idPedido";
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_secuencia_estado
BEFORE UPDATE OF "estado" ON pedidos
FOR EACH ROW EXECUTE FUNCTION trg_fn_validar_secuencia_estado();


-- ============================================================
-- 4. PROCEDIMIENTOS ALMACENADOS
-- ============================================================

-- 4.1 Registra un nuevo pedido (RF-04)
-- Respeta la regla de exclusividad mutua de la tabla pedidos: si se
-- recibe "p_idSuscripcion", el pedido se registra sin "idCliente"
-- (se deduce vía suscripciones); en caso contrario, se registra con
-- "idCliente" y sin suscripción.
CREATE OR REPLACE PROCEDURE sp_registrar_pedido(
    IN  "p_idCliente"     INT,
    IN  "p_idSuscripcion" INT,
    IN  "p_tipo"          VARCHAR(20),
    OUT "p_idPedido"      INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF "p_idSuscripcion" IS NOT NULL THEN
        INSERT INTO pedidos
            ("idSuscripcion", "fecha", "estado", "tipo", "total")
        VALUES
            ("p_idSuscripcion", CURRENT_DATE,
             'recibido', "p_tipo", 0)
        RETURNING "idPedido" INTO "p_idPedido";
    ELSE
        INSERT INTO pedidos
            ("idCliente", "fecha", "estado", "tipo", "total")
        VALUES
            ("p_idCliente", CURRENT_DATE,
             'recibido', "p_tipo", 0)
        RETURNING "idPedido" INTO "p_idPedido";
    END IF;
END;
$$;

-- 4.2 Agrega un producto al detalle de un pedido
CREATE OR REPLACE PROCEDURE sp_agregar_detalle_pedido(
    IN "p_idPedido"   INT,
    IN "p_idProducto" INT,
    IN "p_cantidad"   INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_precio DECIMAL(10,2);
BEGIN
    SELECT "precio" INTO v_precio
    FROM productos
    WHERE "idProducto" = "p_idProducto";

    INSERT INTO detalle_pedido
        ("idPedido", "idProducto", "cantidad", "subtotal")
    VALUES
        ("p_idPedido", "p_idProducto", "p_cantidad",
         v_precio * "p_cantidad");
END;
$$;

-- 4.3 Procesa el cobro periódico de una suscripción (RF-15)
CREATE OR REPLACE PROCEDURE sp_procesar_cobro_suscripcion(
    IN "p_idSuscripcion" INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_idPlan           INT;
    v_monto            DECIMAL(10,2);
    v_fechaCobroActual DATE;
BEGIN
    SELECT "idPlan", "fechaCobro"
    INTO v_idPlan, v_fechaCobroActual
    FROM suscripciones
    WHERE "idSuscripcion" = "p_idSuscripcion";

    SELECT "precio" INTO v_monto
    FROM planes
    WHERE "idPlan" = v_idPlan;

    INSERT INTO pagos
        ("idSuscripcion", "monto", "fecha", "metodo", "estado")
    VALUES
        ("p_idSuscripcion", v_monto, CURRENT_DATE,
         'pasarela', 'aprobado');

    UPDATE suscripciones
    SET "fechaCobro" =
        fn_proxima_fecha_cobro(v_idPlan, v_fechaCobroActual)
    WHERE "idSuscripcion" = "p_idSuscripcion";
END;
$$;

-- 4.4 Cancela una suscripción activa (RF-16)
CREATE OR REPLACE PROCEDURE sp_cancelar_suscripcion(
    IN "p_idSuscripcion" INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE suscripciones
    SET "estado" = 'cancelada'
    WHERE "idSuscripcion" = "p_idSuscripcion";
END;
$$;


-- ============================================================
-- 5. VISTAS
-- ============================================================

-- 5.1 Catálogo público de productos disponibles (RF-03)
CREATE OR REPLACE VIEW vw_catalogo_disponible AS
SELECT "idProducto", "nombre", "descripcion", "precio", "fotoUrl"
FROM productos
WHERE "disponibilidad" = TRUE;

-- 5.2 Pedidos pendientes de atender, con datos del cliente
-- El cliente se resuelve con fn_cliente_de_pedido(), sin importar si
-- el pedido es ocasional o proviene de una suscripción.
CREATE OR REPLACE VIEW vw_pedidos_pendientes AS
SELECT
    p."idPedido", c."idCliente", u."nombre" AS "clienteNombre",
    p."fecha", p."estado", p."tipo", p."total"
FROM pedidos p
JOIN clientes c ON c."idCliente" = fn_cliente_de_pedido(p."idPedido")
JOIN usuarios u ON u."idUsuario" = c."idUsuario"
WHERE p."estado" NOT IN ('entregado', 'cancelado');

-- 5.3 Reporte de ventas por producto (RF-17)
CREATE OR REPLACE VIEW vw_reporte_ventas_producto AS
SELECT
    pr."idProducto", pr."nombre",
    SUM(dp."cantidad") AS "unidadesVendidas",
    SUM(dp."subtotal") AS "totalVendido"
FROM detalle_pedido dp
JOIN productos pr ON pr."idProducto" = dp."idProducto"
GROUP BY pr."idProducto", pr."nombre";

-- 5.4 Insumos en nivel crítico de inventario (RN-05)
CREATE OR REPLACE VIEW vw_inventario_critico AS
SELECT
    "idInsumo", "nombre", "cantidadDisponible",
    "nivelMinimo", "unidadMedida"
FROM insumos
WHERE "cantidadDisponible" <= "nivelMinimo";

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
