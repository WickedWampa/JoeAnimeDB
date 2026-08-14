CREATE TABLE IF NOT EXISTS sync_vaults (
  vault_id TEXT PRIMARY KEY NOT NULL,
  auth_hash TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  algorithm TEXT NOT NULL,
  compression TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS sync_vaults_updated_at
  ON sync_vaults(updated_at);
