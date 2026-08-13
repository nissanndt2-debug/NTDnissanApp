/**
 * Esquema SQLite local. Es un espejo REDUCIDO del Postgres del backend:
 * solo lo que el operador necesita ver y capturar en piso.
 *
 * Dos tablas son propias del cliente y no existen en el servidor:
 *  - `outbox`   : mutaciones pendientes de enviar (el corazon del modo offline)
 *  - `meta`     : marcas de agua de sincronizacion
 */

export const SCHEMA_VERSION = 1;

export const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS unit (
  -- id del servidor; NULL mientras la unidad solo existe en el dispositivo
  id                      INTEGER,
  -- id local (uuid) SIEMPRE presente: permite referenciar unidades nacidas offline
  local_id                TEXT PRIMARY KEY,
  vin                     TEXT NOT NULL,
  market                  TEXT NOT NULL,
  lane                    TEXT NOT NULL,
  status_name             TEXT NOT NULL,
  plant                   TEXT,
  provider_id             INTEGER,
  is_available_today      INTEGER NOT NULL DEFAULT 1,
  estimated_repair_hours  REAL,
  estimated_completion    TEXT,
  priority_rank           INTEGER,
  priority_note           TEXT,
  scm_decision            TEXT,
  registered_by           TEXT,
  created_at              TEXT,
  updated_at              TEXT,
  -- 'synced' | 'pending' | 'failed'
  sync_state              TEXT NOT NULL DEFAULT 'pending'
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_unit_server_id ON unit(id) WHERE id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_unit_status ON unit(status_name);
CREATE INDEX IF NOT EXISTS ix_unit_vin ON unit(vin);
CREATE INDEX IF NOT EXISTS ix_unit_sync ON unit(sync_state);

CREATE TABLE IF NOT EXISTS defect (
  id            INTEGER,
  local_id      TEXT PRIMARY KEY,
  unit_local_id TEXT NOT NULL REFERENCES unit(local_id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  zone          TEXT NOT NULL,
  grade         TEXT NOT NULL,
  description   TEXT,
  is_resolved   INTEGER NOT NULL DEFAULT 0,
  -- URLs ya subidas (JSON array)
  photo_urls    TEXT NOT NULL DEFAULT '[]',
  -- rutas de archivo local aun sin subir (JSON array)
  pending_photos TEXT NOT NULL DEFAULT '[]',
  sync_state    TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS ix_defect_unit ON defect(unit_local_id);

-- Bandeja de salida: toda escritura pasa por aqui antes de tocar la red.
CREATE TABLE IF NOT EXISTS outbox (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  payload         TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_outbox_ready ON outbox(next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
