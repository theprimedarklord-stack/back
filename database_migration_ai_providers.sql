-- =====================================================
-- SQL Migration: AI Providers Integration
-- Описание: Добавление поддержки OpenAI и Anthropic провайдеров
-- Дата: 2024
-- =====================================================

-- =====================================================
-- 1. ОБНОВЛЕНИЕ ТАБЛИЦЫ ai_settings
-- =====================================================

-- Добавляем колонку provider в ai_settings
ALTER TABLE ai_settings 
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'gemini';

-- Обновляем существующие записи (если provider NULL, ставим 'gemini')
UPDATE ai_settings 
SET provider = 'gemini' 
WHERE provider IS NULL;

-- Добавляем constraint для проверки допустимых значений (если еще нет)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ai_settings_provider_check'
  ) THEN
    ALTER TABLE ai_settings 
    ADD CONSTRAINT ai_settings_provider_check 
      CHECK (provider IN ('gemini', 'openai', 'anthropic'));
  END IF;
END $$;

-- Комментарий к колонке
COMMENT ON COLUMN ai_settings.provider IS 'AI провайдер: gemini, openai или anthropic';

-- =====================================================
-- 2. СОЗДАНИЕ ТАБЛИЦЫ ai_chat_settings
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_chat_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT NOT NULL,
  temperature FLOAT DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 2048,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id),
  CONSTRAINT ai_chat_settings_provider_check 
    CHECK (provider IN ('gemini', 'openai', 'anthropic')),
  CONSTRAINT ai_chat_settings_temperature_check 
    CHECK (temperature >= 0.0 AND temperature <= 2.0),
  CONSTRAINT ai_chat_settings_max_tokens_check 
    CHECK (max_tokens >= 1 AND max_tokens <= 8192)
);

-- Комментарии к таблице и колонкам
COMMENT ON TABLE ai_chat_settings IS 'Настройки AI для чата';
COMMENT ON COLUMN ai_chat_settings.user_id IS 'ID пользователя (FK к users)';
COMMENT ON COLUMN ai_chat_settings.provider IS 'AI провайдер: gemini, openai или anthropic';
COMMENT ON COLUMN ai_chat_settings.model IS 'Название модели AI';
COMMENT ON COLUMN ai_chat_settings.temperature IS 'Температура генерации (0.0-2.0)';
COMMENT ON COLUMN ai_chat_settings.max_tokens IS 'Максимальное количество токенов (1-8192)';

-- =====================================================
-- 3. СОЗДАНИЕ ТАБЛИЦЫ ai_outline_settings
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_outline_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT NOT NULL,
  temperature FLOAT DEFAULT 0.7,
  default_actions JSONB DEFAULT '{"explain": true, "summarize": true, "translate": true, "connections": true, "create_card": true}'::jsonb,
  connections_enabled BOOLEAN DEFAULT true,
  auto_scroll BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id),
  CONSTRAINT ai_outline_settings_provider_check 
    CHECK (provider IN ('gemini', 'openai', 'anthropic')),
  CONSTRAINT ai_outline_settings_temperature_check 
    CHECK (temperature >= 0.0 AND temperature <= 2.0)
);

-- Комментарии к таблице и колонкам
COMMENT ON TABLE ai_outline_settings IS 'Настройки AI для Outline Assistant';
COMMENT ON COLUMN ai_outline_settings.user_id IS 'ID пользователя (FK к users)';
COMMENT ON COLUMN ai_outline_settings.provider IS 'AI провайдер: gemini, openai или anthropic';
COMMENT ON COLUMN ai_outline_settings.model IS 'Название модели AI';
COMMENT ON COLUMN ai_outline_settings.temperature IS 'Температура генерации (0.0-2.0)';
COMMENT ON COLUMN ai_outline_settings.default_actions IS 'JSON объект с настройками действий по умолчанию';
COMMENT ON COLUMN ai_outline_settings.connections_enabled IS 'Включены ли связи между карточками';
COMMENT ON COLUMN ai_outline_settings.auto_scroll IS 'Автоматическая прокрутка';

-- =====================================================
-- 4. СОЗДАНИЕ ИНДЕКСОВ
-- =====================================================

-- Индексы для ai_chat_settings
CREATE INDEX IF NOT EXISTS idx_ai_chat_settings_user_id 
  ON ai_chat_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_chat_settings_provider 
  ON ai_chat_settings(provider);

-- Индексы для ai_outline_settings
CREATE INDEX IF NOT EXISTS idx_ai_outline_settings_user_id 
  ON ai_outline_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_outline_settings_provider 
  ON ai_outline_settings(provider);

-- Индекс для ai_settings.provider (если еще нет)
CREATE INDEX IF NOT EXISTS idx_ai_settings_provider 
  ON ai_settings(provider);

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Включаем RLS для ai_chat_settings
ALTER TABLE ai_chat_settings ENABLE ROW LEVEL SECURITY;

-- Политика SELECT: пользователь может видеть только свои настройки
DROP POLICY IF EXISTS ai_chat_settings_select_policy ON ai_chat_settings;
CREATE POLICY ai_chat_settings_select_policy
  ON ai_chat_settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Политика INSERT: пользователь может создавать только свои настройки
DROP POLICY IF EXISTS ai_chat_settings_insert_policy ON ai_chat_settings;
CREATE POLICY ai_chat_settings_insert_policy
  ON ai_chat_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Политика UPDATE: пользователь может обновлять только свои настройки
DROP POLICY IF EXISTS ai_chat_settings_update_policy ON ai_chat_settings;
CREATE POLICY ai_chat_settings_update_policy
  ON ai_chat_settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Политика DELETE: пользователь может удалять только свои настройки
DROP POLICY IF EXISTS ai_chat_settings_delete_policy ON ai_chat_settings;
CREATE POLICY ai_chat_settings_delete_policy
  ON ai_chat_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Включаем RLS для ai_outline_settings
ALTER TABLE ai_outline_settings ENABLE ROW LEVEL SECURITY;

-- Политика SELECT: пользователь может видеть только свои настройки
DROP POLICY IF EXISTS ai_outline_settings_select_policy ON ai_outline_settings;
CREATE POLICY ai_outline_settings_select_policy
  ON ai_outline_settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Политика INSERT: пользователь может создавать только свои настройки
DROP POLICY IF EXISTS ai_outline_settings_insert_policy ON ai_outline_settings;
CREATE POLICY ai_outline_settings_insert_policy
  ON ai_outline_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Политика UPDATE: пользователь может обновлять только свои настройки
DROP POLICY IF EXISTS ai_outline_settings_update_policy ON ai_outline_settings;
CREATE POLICY ai_outline_settings_update_policy
  ON ai_outline_settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Политика DELETE: пользователь может удалять только свои настройки
DROP POLICY IF EXISTS ai_outline_settings_delete_policy ON ai_outline_settings;
CREATE POLICY ai_outline_settings_delete_policy
  ON ai_outline_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- 6. ТРИГГЕРЫ ДЛЯ updated_at
-- =====================================================

-- Функция для обновления updated_at (если еще не существует)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для ai_chat_settings
DROP TRIGGER IF EXISTS update_ai_chat_settings_updated_at ON ai_chat_settings;
CREATE TRIGGER update_ai_chat_settings_updated_at
  BEFORE UPDATE ON ai_chat_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Триггер для ai_outline_settings
DROP TRIGGER IF EXISTS update_ai_outline_settings_updated_at ON ai_outline_settings;
CREATE TRIGGER update_ai_outline_settings_updated_at
  BEFORE UPDATE ON ai_outline_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Триггер для ai_settings (если еще нет)
DROP TRIGGER IF EXISTS update_ai_settings_updated_at ON ai_settings;
CREATE TRIGGER update_ai_settings_updated_at
  BEFORE UPDATE ON ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. ПРОВЕРКА И ВАЛИДАЦИЯ
-- =====================================================

-- ВАЖНО: Этот блок проверки выполняется отдельно
-- Если нужно проверить миграцию, используйте файл database_check_ai_providers.sql
-- 
-- Проверяем, что все колонки созданы
-- DO $$
-- BEGIN
--   -- Проверка ai_settings.provider
--   IF NOT EXISTS (
--     SELECT 1 FROM information_schema.columns 
--     WHERE table_name = 'ai_settings' AND column_name = 'provider'
--   ) THEN
--     RAISE EXCEPTION 'Колонка ai_settings.provider не создана!';
--   END IF;
--
--   -- Проверка таблицы ai_chat_settings
--   IF NOT EXISTS (
--     SELECT 1 FROM information_schema.tables 
--     WHERE table_schema = 'public' AND table_name = 'ai_chat_settings'
--   ) THEN
--     RAISE EXCEPTION 'Таблица ai_chat_settings не создана!';
--   END IF;
--
--   -- Проверка таблицы ai_outline_settings
--   IF NOT EXISTS (
--     SELECT 1 FROM information_schema.tables 
--     WHERE table_schema = 'public' AND table_name = 'ai_outline_settings'
--   ) THEN
--     RAISE EXCEPTION 'Таблица ai_outline_settings не создана!';
--   END IF;
--
--   RAISE NOTICE 'Все проверки пройдены успешно!';
-- END $$;

-- =====================================================
-- 8. ПРИМЕРЫ ЗАПРОСОВ ДЛЯ ТЕСТИРОВАНИЯ
-- =====================================================

-- Пример: Получить настройки чата для пользователя
-- SELECT * FROM ai_chat_settings WHERE user_id = 'USER_ID_HERE';

-- Пример: Создать настройки чата
-- INSERT INTO ai_chat_settings (user_id, provider, model, temperature, max_tokens)
-- VALUES ('USER_ID_HERE', 'gemini', 'gemini-2.5-flash', 0.7, 2048)
-- ON CONFLICT (user_id) DO UPDATE SET
--   provider = EXCLUDED.provider,
--   model = EXCLUDED.model,
--   temperature = EXCLUDED.temperature,
--   max_tokens = EXCLUDED.max_tokens,
--   updated_at = NOW();

-- Пример: Обновить настройки outline
-- UPDATE ai_outline_settings
-- SET provider = 'openai', model = 'gpt-4', temperature = 0.8
-- WHERE user_id = 'USER_ID_HERE';

-- =====================================================
-- КОНЕЦ МИГРАЦИИ
-- =====================================================

