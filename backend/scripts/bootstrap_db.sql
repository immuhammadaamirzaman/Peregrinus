-- Bootstrap the DataMovers metadata database.
-- Run ONCE as the postgres superuser, e.g.:
--   psql -U postgres -f scripts/bootstrap_db.sql
--
-- IMPORTANT: change 'change-me' to match POSTGRES_PASSWORD in your .env.

-- Create the application role (idempotent).
-- DO $$
-- BEGIN
--    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'datamovers') THEN
--       CREATE ROLE datamovers WITH LOGIN PASSWORD 'change-me';
--    END IF;
-- END
-- $$;

-- Create the database (Postgres has no IF NOT EXISTS for databases;
-- ignore the error if it already exists).
CREATE DATABASE datamovers OWNER datamovers;

GRANT ALL PRIVILEGES ON DATABASE datamovers TO datamovers;
