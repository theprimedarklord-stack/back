-- =====================================================
-- SQL Migration: Sidebar Mode Support
-- Описание: Замена sidebar_pinned на sidebar_mode с 4 режимами
-- Дата: 2024
-- =====================================================

-- =====================================================
-- 1. ДОБАВЛЕНИЕ КОЛОНКИ sidebar_mode
-- =====================================================

-- Добавляем колонку sidebar_mode
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS sidebar_mode TEXT;

-- Устанавливаем значение по умолчанию для существующих записей
UPDATE user_settings 
SET sidebar_mode = 'expanded' 
WHERE sidebar_mode IS NULL;

-- Устанавливаем значение по умолчанию для новых записей
ALTER TABLE user_settings 
ALTER COLUMN sidebar_mode SET DEFAULT 'expanded';

-- Добавляем CHECK constraint для валидации значений
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_settings_sidebar_mode_check'
  ) THEN
    ALTER TABLE user_settings 
    ADD CONSTRAINT user_settings_sidebar_mode_check 
      CHECK (sidebar_mode IN ('expanded', 'collapsed', 'hover', 'overlay'));
  END IF;
END $$;

-- Комментарий к колонке
COMMENT ON COLUMN user_settings.sidebar_mode IS 'Режим сайдбара: expanded (всегда открыт), collapsed (всегда закрыт), hover (при ховере), overlay (поверх контента)';

-- =====================================================
-- 2. УДАЛЕНИЕ КОЛОНКИ sidebar_pinned
-- =====================================================

-- Удаляем колонку sidebar_pinned (больше не нужна)
ALTER TABLE user_settings 
DROP COLUMN IF EXISTS sidebar_pinned;

-- =====================================================
-- 3. ПРОВЕРКА
-- =====================================================

-- Проверяем структуру таблицы
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_settings' 
AND column_name IN ('sidebar_mode', 'sidebar_pinned');

