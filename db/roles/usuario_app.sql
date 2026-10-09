-- ============================================================
-- db/roles/usuario_app.sql
-- Usuario de aplicación con mínimo privilegio (DML, sin DDL).
-- NO está en db/migrations/ a propósito: requiere una contraseña y
-- lo aplica scripts/deploy-azure.sh con el usuario ADMIN:
--   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -v app_password="$PASSWORD" -f db/roles/usuario_app.sql
-- Idempotente: si el rol existe solo se cambia su contraseña.
-- ============================================================

-- Los DO no ven las variables de psql: se pasan por set_config.
-- \gset descarta el resultado: la contraseña no se imprime.
SELECT set_config('elfrutal.app_password', :'app_password', false) AS _ \gset

DO $$
DECLARE
    v_clave TEXT := current_setting('elfrutal.app_password');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elfrutal_app') THEN
        EXECUTE format('CREATE ROLE elfrutal_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', v_clave);
    ELSE
        EXECUTE format('ALTER ROLE elfrutal_app LOGIN PASSWORD %L', v_clave);
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO elfrutal_app', current_database());
END
$$;

SELECT set_config('elfrutal.app_password', '', false) AS _ \gset

-- Nadie (PUBLIC) puede crear objetos en public.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM elfrutal_app;

GRANT USAGE ON SCHEMA public TO elfrutal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO elfrutal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO elfrutal_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO elfrutal_app;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO elfrutal_app;

-- Objetos que cree después el usuario que ejecuta este script (admin).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO elfrutal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO elfrutal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO elfrutal_app;
