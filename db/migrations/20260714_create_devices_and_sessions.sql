-- ============================================================
-- Migration: Create devices + runtime_sessions tables
-- Date: 2026-07-14
-- Purpose: Support Private Terminal Node (device pairing & sessions)
-- ============================================================

-- 1. Devices table — stores paired agent instances
CREATE TABLE IF NOT EXISTS devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Unknown PC',
  device_key_hash TEXT NOT NULL,
  fingerprint   TEXT,
  os_info       JSONB DEFAULT '{}',
  capabilities  TEXT[] DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
  last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- Index for device key authentication (agent connects with key, we hash and look up)
CREATE INDEX IF NOT EXISTS idx_devices_key_hash ON devices(device_key_hash);

-- 2. Runtime sessions table — tracks active terminal sessions
CREATE TABLE IF NOT EXISTS runtime_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         TEXT NOT NULL,
  user_id         UUID NOT NULL,
  device_id       UUID REFERENCES devices(id) ON DELETE SET NULL,
  agent_id        TEXT,
  runtime_type    TEXT NOT NULL DEFAULT 'terminal',
  runtime_config  JSONB DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'terminated', 'error')),
  metadata        JSONB DEFAULT '{}',
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runtime_sessions_user_id ON runtime_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_device_id ON runtime_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_status ON runtime_sessions(status);
