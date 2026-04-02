-- migrations/add_webauthn_tables.sql
-- WebAuthn/FIDO2 credential storage for biometric login

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credential_id    TEXT NOT NULL UNIQUE,
  public_key       BYTEA NOT NULL,
  sign_count       INTEGER NOT NULL DEFAULT 0,
  device_name      VARCHAR(100),
  created_at       TIMESTAMP DEFAULT NOW(),
  last_used_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webauthn_cred_tenant_user ON webauthn_credentials(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_cred_id ON webauthn_credentials(credential_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  user_id    INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  challenge  TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);
