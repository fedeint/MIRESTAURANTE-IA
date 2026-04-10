-- Bóveda de contraseñas cifradas para superadmin
-- Cifrado: AES-256-GCM server-side con VAULT_SECRET

CREATE TABLE IF NOT EXISTS vault_items (
  id           SERIAL PRIMARY KEY,
  categoria    VARCHAR(50)  NOT NULL DEFAULT 'otros',
  titulo       VARCHAR(255) NOT NULL,
  usuario      VARCHAR(255),
  encrypted    TEXT         NOT NULL,  -- JSON cifrado: {iv, tag, data}
  url          VARCHAR(500),
  notas        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_categoria ON vault_items(categoria);
