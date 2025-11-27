# Инструкция по выполнению миграции базы данных для AI Providers

## Что делает эта миграция?

1. **Обновляет таблицу `ai_settings`** - добавляет колонку `provider` для выбора провайдера (gemini/openai/anthropic)
2. **Создает таблицу `ai_chat_settings`** - настройки для AI Chat
3. **Создает таблицу `ai_outline_settings`** - настройки для AI Outline Assistant
4. **Настраивает RLS (Row Level Security)** - политики безопасности для новых таблиц
5. **Создает индексы** - для оптимизации запросов
6. **Создает триггеры** - для автоматического обновления `updated_at`

## Как выполнить миграцию

### Вариант 1: Через Supabase Dashboard (Рекомендуется)

1. Откройте [Supabase Dashboard](https://app.supabase.com)
2. Выберите ваш проект
3. Перейдите в **SQL Editor** (в левом меню)
4. Откройте файл `database_migration_ai_providers.sql`
5. Скопируйте **весь** содержимое файла
6. Вставьте в SQL Editor
7. Нажмите **Run** (или `Ctrl+Enter`)

### Вариант 2: Через psql (командная строка)

```bash
psql -h YOUR_DB_HOST -U postgres -d postgres -f database_migration_ai_providers.sql
```

## Проверка после миграции

После выполнения миграции проверьте:

1. **Колонка provider в ai_settings:**
   ```sql
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'ai_settings' AND column_name = 'provider';
   ```

2. **Таблица ai_chat_settings существует:**
   ```sql
   SELECT * FROM ai_chat_settings LIMIT 1;
   ```

3. **Таблица ai_outline_settings существует:**
   ```sql
   SELECT * FROM ai_outline_settings LIMIT 1;
   ```

4. **RLS включен:**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename IN ('ai_chat_settings', 'ai_outline_settings');
   ```

## Структура таблиц

### ai_settings (обновлена)
- `provider` TEXT - провайдер AI (gemini/openai/anthropic)

### ai_chat_settings (новая)
- `id` BIGSERIAL PRIMARY KEY
- `user_id` UUID - ID пользователя
- `provider` TEXT - провайдер (gemini/openai/anthropic)
- `model` TEXT - модель AI
- `temperature` FLOAT (0.0-2.0)
- `max_tokens` INTEGER (1-8192)
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

### ai_outline_settings (новая)
- `id` BIGSERIAL PRIMARY KEY
- `user_id` UUID - ID пользователя
- `provider` TEXT - провайдер (gemini/openai/anthropic)
- `model` TEXT - модель AI
- `temperature` FLOAT (0.0-2.0)
- `default_actions` JSONB - настройки действий
- `connections_enabled` BOOLEAN
- `auto_scroll` BOOLEAN
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

## Важные замечания

1. **Безопасность**: Все таблицы защищены RLS политиками - пользователи видят только свои данные
2. **Обратная совместимость**: Существующие записи в `ai_settings` автоматически получат `provider = 'gemini'`
3. **Ограничения**: 
   - `provider` может быть только: 'gemini', 'openai', 'anthropic'
   - `temperature` должен быть в диапазоне 0.0-2.0
   - `max_tokens` должен быть в диапазоне 1-8192
4. **Уникальность**: Каждый пользователь может иметь только одну запись в каждой таблице настроек

## Откат миграции (если нужно)

Если нужно откатить изменения:

```sql
-- Удалить таблицы
DROP TABLE IF EXISTS ai_outline_settings CASCADE;
DROP TABLE IF EXISTS ai_chat_settings CASCADE;

-- Удалить колонку provider из ai_settings
ALTER TABLE ai_settings DROP COLUMN IF EXISTS provider;
ALTER TABLE ai_settings DROP CONSTRAINT IF EXISTS ai_settings_provider_check;
```

## Поддержка

Если возникли проблемы:
1. Проверьте логи в Supabase Dashboard → Logs
2. Убедитесь, что у вас есть права на создание таблиц
3. Проверьте, что функция `update_updated_at_column()` существует

