-- Creates the separate 'evolution' database used by Evolution API v2.x
-- This runs once at first PostgreSQL container start.
-- The bot uses the 'wabizz' database; Evolution uses 'evolution'.
SELECT 'CREATE DATABASE evolution'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution')\gexec
