-- ============================================================
-- db/02_seed.sql
-- Datos semilla para desarrollo/QA — Panadería El Frutal
-- Se monta después de db/01_schema.sql en docker-entrypoint-initdb.d.
-- Contraseñas hasheadas con bcrypt (costo 10) fuera de este script
-- (nunca en texto plano) mediante scripts/hash-passwords.js.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Usuarios y roles
-- ------------------------------------------------------------
INSERT INTO usuarios ("idUsuario", "nombre", "correo", "contrasenaHash", "rol") VALUES
(1, 'Administradora El Frutal', 'admin@elfrutal.com', '$2b$10$4gCvej8gWGX/ihdn9NnCe.I.EFKLyUBFr3N8ClL9MaW7u5ylYCecW', 'administrador'),
(2, 'Operador de Ventas',       'ventas@elfrutal.com', '$2b$10$69v9jx/5Dy.u1xxodC/6qOOH0bo6kRuhpOGBo4Bp77vuBJequeFw2', 'operador'),
(3, 'Operador de Producción',   'produccion@elfrutal.com', '$2b$10$RGK0C5uBskkUAzQs2V6qJuOcs69jVFEO32cilpWZXm/RJjwzUZwbK', 'operador'),
(4, 'Cliente Demo',             'cliente@elfrutal.com', '$2b$10$O8nv3UV377wlClUf7RQHauaLOScT7s0BL013Mh78zaB8.tdQ08iga', 'cliente');
SELECT setval(pg_get_serial_sequence('usuarios', 'idUsuario'), 4);

INSERT INTO personal ("idUsuario", "area") VALUES
(2, 'ventas'),
(3, 'produccion');

INSERT INTO clientes ("idUsuario", "telefono", "direccion", "tipoCliente") VALUES
(4, '50212345678', 'Zona 1, Ciudad de Guatemala', 'ocasional');

-- ------------------------------------------------------------
-- 2. Productos (catálogo)
-- ------------------------------------------------------------
INSERT INTO productos ("idProducto", "nombre", "descripcion", "precio", "disponibilidad", "fotoUrl") VALUES
(1, 'Pan francés',          'Pan francés tradicional, crujiente por fuera y suave por dentro.', 1.50, TRUE,  'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400'),
(2, 'Champurradas',         'Galletas guatemaltecas crocantes con ajonjolí.',                    12.00, TRUE, 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400'),
(3, 'Conchas',              'Pan dulce con costra de azúcar en forma de concha.',                3.50, TRUE,  'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?w=400'),
(4, 'Pan de manteca',       'Pan tradicional guatemalteco horneado con manteca.',                2.00, TRUE,  'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?w=400'),
(5, 'Quesadilla',           'Pan dulce guatemalteco a base de queso y arroz.',                   4.50, TRUE,  'https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?w=400'),
(6, 'Cubiletes',            'Pastelillo relleno de mermelada de piña.',                          3.00, TRUE,  'https://images.unsplash.com/photo-1509365465985-25d11c17e812?w=400'),
(7, 'Pastel de tres leches','Pastel húmedo bañado en tres tipos de leche.',                      85.00, TRUE, 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=400'),
(8, 'Pan de elote',         'Pan dulce a base de elote tierno (temporalmente agotado).',         6.00, FALSE, 'https://images.unsplash.com/photo-1620921575561-7f6a1e659e51?w=400');
SELECT setval(pg_get_serial_sequence('productos', 'idProducto'), 8);

-- ------------------------------------------------------------
-- 3. Insumos e inventario
-- ------------------------------------------------------------
INSERT INTO insumos ("idInsumo", "nombre", "cantidadDisponible", "nivelMinimo", "unidadMedida") VALUES
(1, 'Harina',     100.00, 10.00, 'kg'),
(2, 'Azúcar',      50.00,  5.00, 'kg'),
(3, 'Mantequilla', 30.00,  5.00, 'kg'),
(4, 'Huevos',     200.00, 20.00, 'unidad'),
(5, 'Levadura',    10.00,  2.00, 'kg'),
(6, 'Leche',       60.00, 10.00, 'L');
SELECT setval(pg_get_serial_sequence('insumos', 'idInsumo'), 6);

-- ------------------------------------------------------------
-- 4. Recetas (producto_insumo)
-- ------------------------------------------------------------
INSERT INTO producto_insumo ("idProducto", "idInsumo", "cantidadRequerida") VALUES
(1, 1, 0.05), (1, 5, 0.005),
(2, 1, 0.08), (2, 2, 0.03), (2, 3, 0.02),
(3, 1, 0.06), (3, 2, 0.02), (3, 3, 0.015), (3, 4, 0.10),
(4, 1, 0.05), (4, 3, 0.02),
(5, 1, 0.05), (5, 2, 0.03), (5, 4, 0.15), (5, 6, 0.02),
(6, 1, 0.04), (6, 3, 0.015), (6, 4, 0.10),
(7, 1, 0.30), (7, 2, 0.20), (7, 3, 0.10), (7, 4, 1.00), (7, 6, 0.30),
(8, 1, 0.10), (8, 4, 0.20), (8, 6, 0.05);

-- ------------------------------------------------------------
-- 5. Planes de suscripción
-- ------------------------------------------------------------
INSERT INTO planes ("idPlan", "nombre", "frecuencia", "precio") VALUES
(1, 'Plan diario',          'diario',         450.00),
(2, 'Plan tres semanales',  'tres_semanales', 300.00),
(3, 'Plan fin de semana',   'fin_de_semana',  150.00);
SELECT setval(pg_get_serial_sequence('planes', 'idPlan'), 3);

-- ------------------------------------------------------------
-- 6. Historial de pedidos entregados (~30 días) para reportes
--    (RF-17, RF-18, RF-19). Solo usa productos disponibles.
-- ------------------------------------------------------------
DO $$
DECLARE
    v_dia         DATE;
    v_idPedido    INT;
    v_ordenesDia  INT;
    v_idProducto  INT;
    v_cantidad    INT;
    v_precio      DECIMAL(10,2);
    i             INT;
    j             INT;
    v_productos   INT[] := ARRAY[1,2,3,4,5,6,7];
BEGIN
    FOR i IN 0..29 LOOP
        v_dia := CURRENT_DATE - i;
        v_ordenesDia := 1 + floor(random() * 3)::INT; -- 1 a 3 pedidos/día

        FOR j IN 1..v_ordenesDia LOOP
            INSERT INTO pedidos
                ("idCliente", "fecha", "estado", "tipo", "total")
            VALUES
                (1, v_dia, 'entregado', 'ocasional', 0)
            RETURNING "idPedido" INTO v_idPedido;

            -- 1 a 3 líneas de detalle por pedido
            FOR k IN 1..(1 + floor(random() * 3)::INT) LOOP
                v_idProducto := v_productos[1 + floor(random() * array_length(v_productos, 1))::INT];
                v_cantidad := 1 + floor(random() * 5)::INT;
                SELECT "precio" INTO v_precio FROM productos WHERE "idProducto" = v_idProducto;

                INSERT INTO detalle_pedido
                    ("idPedido", "idProducto", "cantidad", "subtotal")
                VALUES
                    (v_idPedido, v_idProducto, v_cantidad, v_precio * v_cantidad);
            END LOOP;
        END LOOP;
    END LOOP;

    -- Restaura el inventario a niveles saludables después de que el
    -- historial de ventas simuladas lo haya descontado (RF-10 ya se
    -- probó al insertar el detalle anterior).
    UPDATE insumos SET "cantidadDisponible" = 100.00 WHERE "idInsumo" = 1;
    UPDATE insumos SET "cantidadDisponible" = 50.00  WHERE "idInsumo" = 2;
    UPDATE insumos SET "cantidadDisponible" = 30.00  WHERE "idInsumo" = 3;
    UPDATE insumos SET "cantidadDisponible" = 200.00 WHERE "idInsumo" = 4;
    UPDATE insumos SET "cantidadDisponible" = 10.00  WHERE "idInsumo" = 5;
    UPDATE insumos SET "cantidadDisponible" = 60.00  WHERE "idInsumo" = 6;
END $$;

-- ============================================================
-- FIN DEL SEED
-- ============================================================
