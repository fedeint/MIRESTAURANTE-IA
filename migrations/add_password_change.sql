-- migrations/add_password_change.sql
-- Adds must_change_password flag and password expiry to usuarios

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMP;
