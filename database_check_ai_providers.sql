-- =====================================================
-- ПРОВЕРОЧНЫЕ КОМАНДЫ ДЛЯ AI PROVIDERS MIGRATION
-- Выполняйте эти команды по очереди для проверки
-- =====================================================

-- =====================================================
-- 1. ПРОВЕРКА КОЛОНКИ provider В ai_settings
-- =====================================================

-- Проверка существования колонки
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'ai_settings' 
  AND column_name = 'provider';

-- Проверка constraint
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'ai_settings'::regclass 
  AND conname = 'ai_settings_provider_check';

-- Проверка данных (первые 5 записей)
SELECT 
  id, 
  user_id, 
  provider, 
  model,
  enabled
FROM ai_settings 
LIMIT 5;

-- Проверка, что все записи имеют provider
SELECT 
  COUNT(*) AS total_records,
  COUNT(provider) AS records_with_provider,
  COUNT(*) - COUNT(provider) AS records_without_provider
FROM ai_settings;

-- =====================================================
-- 2. ПРОВЕРКА ТАБЛИЦЫ ai_chat_settings
-- =====================================================

-- Проверка существования таблицы
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'ai_chat_settings';

-- Проверка структуры таблицы
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable,
  character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'ai_chat_settings'
ORDER BY ordinal_position;

-- Проверка constraints
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'ai_chat_settings'::regclass
ORDER BY conname;

-- Проверка индексов
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'ai_chat_settings';

-- Проверка RLS
SELECT 
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'ai_chat_settings';

-- Проверка RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies 
WHERE tablename = 'ai_chat_settings'
ORDER BY policyname;

-- Проверка триггеров
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'ai_chat_settings';

-- Проверка данных (если есть)
SELECT COUNT(*) AS total_records FROM ai_chat_settings;

-- =====================================================
-- 3. ПРОВЕРКА ТАБЛИЦЫ ai_outline_settings
-- =====================================================

-- Проверка существования таблицы
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'ai_outline_settings';

-- Проверка структуры таблицы
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable,
  udt_name
FROM information_schema.columns 
WHERE table_name = 'ai_outline_settings'
ORDER BY ordinal_position;

-- Проверка constraints
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'ai_outline_settings'::regclass
ORDER BY conname;

-- Проверка индексов
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'ai_outline_settings';

-- Проверка RLS
SELECT 
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'ai_outline_settings';

-- Проверка RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies 
WHERE tablename = 'ai_outline_settings'
ORDER BY policyname;

-- Проверка триггеров
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'ai_outline_settings';

-- Проверка данных (если есть)
SELECT COUNT(*) AS total_records FROM ai_outline_settings;

-- =====================================================
-- 4. ПРОВЕРКА ФУНКЦИИ update_updated_at_column
-- =====================================================

-- Проверка существования функции
SELECT 
  routine_name,
  routine_type,
  data_type AS return_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'update_updated_at_column';

-- Просмотр кода функции
SELECT 
  pg_get_functiondef(oid) AS function_definition
FROM pg_proc 
WHERE proname = 'update_updated_at_column';

-- =====================================================
-- 5. ОБЩАЯ ПРОВЕРКА ВСЕХ ТАБЛИЦ
-- =====================================================

-- Список всех AI таблиц
SELECT 
  table_name,
  (SELECT COUNT(*) 
   FROM information_schema.columns 
   WHERE table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN ('ai_settings', 'ai_chat_settings', 'ai_outline_settings')
ORDER BY table_name;

-- Проверка всех индексов на AI таблицах
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('ai_settings', 'ai_chat_settings', 'ai_outline_settings')
ORDER BY tablename, indexname;

-- Проверка всех триггеров на AI таблицах
SELECT 
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE event_object_schema = 'public'
  AND event_object_table IN ('ai_settings', 'ai_chat_settings', 'ai_outline_settings')
ORDER BY event_object_table, trigger_name;

-- Проверка всех RLS policies на AI таблицах
SELECT 
  tablename,
  policyname,
  cmd AS command
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN ('ai_settings', 'ai_chat_settings', 'ai_outline_settings')
ORDER BY tablename, policyname;

-- =====================================================
-- 6. ТЕСТОВЫЕ ЗАПРОСЫ (для проверки работы)
-- =====================================================

-- Тест: Попытка вставить недопустимый provider (должна быть ошибка)
-- Раскомментируйте для теста:
-- INSERT INTO ai_chat_settings (user_id, provider, model) 
-- VALUES ('00000000-0000-0000-0000-000000000000', 'invalid_provider', 'test-model');

-- Тест: Попытка вставить temperature > 2.0 (должна быть ошибка)
-- Раскомментируйте для теста:
-- INSERT INTO ai_chat_settings (user_id, provider, model, temperature) 
-- VALUES ('00000000-0000-0000-0000-000000000000', 'gemini', 'test-model', 3.0);

-- Тест: Проверка default значений
SELECT 
  column_name,
  column_default
FROM information_schema.columns 
WHERE table_name = 'ai_chat_settings' 
  AND column_default IS NOT NULL;

SELECT 
  column_name,
  column_default
FROM information_schema.columns 
WHERE table_name = 'ai_outline_settings' 
  AND column_default IS NOT NULL;

-- =====================================================
-- 7. ФИНАЛЬНАЯ СВОДКА
-- =====================================================

-- Сводная таблица всех проверок
SELECT 
  'ai_settings.provider column' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'ai_settings' AND column_name = 'provider'
    ) THEN '✓ OK'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'ai_chat_settings table' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'ai_chat_settings'
    ) THEN '✓ OK'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'ai_outline_settings table' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'ai_outline_settings'
    ) THEN '✓ OK'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'update_updated_at_column function' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'update_updated_at_column'
    ) THEN '✓ OK'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'ai_chat_settings RLS enabled' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename = 'ai_chat_settings' 
        AND rowsecurity = true
    ) THEN '✓ OK'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'ai_outline_settings RLS enabled' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename = 'ai_outline_settings' 
        AND rowsecurity = true
    ) THEN '✓ OK'
    ELSE '✗ MISSING'
  END AS status
ORDER BY check_item;

