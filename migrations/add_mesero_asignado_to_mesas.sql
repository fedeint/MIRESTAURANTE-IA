-- Migration: add waiter assignment columns to mesas table
-- Run this once against the PostgreSQL database before restarting the server.

ALTER TABLE mesas ADD COLUMN IF NOT EXISTS mesero_asignado_id INTEGER REFERENCES usuarios(id);
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS mesero_asignado_nombre VARCHAR(100);
