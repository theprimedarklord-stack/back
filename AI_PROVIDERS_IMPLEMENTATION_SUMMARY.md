# Сводка реализации: Интеграция OpenAI и Anthropic провайдеров

## 📋 Обзор

Реализована поддержка трех AI провайдеров (Gemini, OpenAI, Anthropic) в backend, создана система провайдеров, добавлены новые endpoints для chat и outline settings, обновлена база данных.

---

## 🗄️ ИЗМЕНЕНИЯ В БАЗЕ ДАННЫХ (Supabase)

### 1. Обновление таблицы `ai_settings`

**Что сделано:**
- ✅ Добавлена колонка `provider` типа `TEXT` с дефолтным значением `'gemini'`
- ✅ Обновлены все существующие записи: установлен `provider = 'gemini'` для записей с NULL
- ✅ Добавлен constraint `ai_settings_provider_check` для валидации значений (`'gemini'`, `'openai'`, `'anthropic'`)
- ✅ Добавлен индекс `idx_ai_settings_provider` для оптимизации запросов
- ✅ Добавлен триггер `update_ai_settings_updated_at` для автоматического обновления `updated_at`

**SQL:**
```sql
ALTER TABLE ai_settings ADD COLUMN provider TEXT DEFAULT 'gemini';
UPDATE ai_settings SET provider = 'gemini' WHERE provider IS NULL;
-- Constraint добавлен через DO блок
-- Индекс и триггер созданы
```

### 2. Создание таблицы `ai_chat_settings`

**Структура:**
- `id` BIGSERIAL PRIMARY KEY
- `user_id` UUID NOT NULL (FK к users, ON DELETE CASCADE)
- `provider` TEXT NOT NULL DEFAULT 'gemini' (constraint: gemini/openai/anthropic)
- `model` TEXT NOT NULL
- `temperature` FLOAT DEFAULT 0.7 (constraint: 0.0-2.0)
- `max_tokens` INTEGER DEFAULT 2048 (constraint: 1-8192)
- `created_at` TIMESTAMP DEFAULT NOW()
- `updated_at` TIMESTAMP DEFAULT NOW()
- UNIQUE(user_id)

**Что создано:**
- ✅ Таблица с constraints
- ✅ Индексы: `idx_ai_chat_settings_user_id`, `idx_ai_chat_settings_provider`
- ✅ RLS включен
- ✅ 4 RLS policies: SELECT, INSERT, UPDATE, DELETE
- ✅ Триггер `update_ai_chat_settings_updated_at`

### 3. Создание таблицы `ai_outline_settings`

**Структура:**
- `id` BIGSERIAL PRIMARY KEY
- `user_id` UUID NOT NULL (FK к users, ON DELETE CASCADE)
- `provider` TEXT NOT NULL DEFAULT 'gemini' (constraint: gemini/openai/anthropic)
- `model` TEXT NOT NULL
- `temperature` FLOAT DEFAULT 0.7 (constraint: 0.0-2.0)
- `default_actions` JSONB DEFAULT '{"explain": true, "summarize": true, "translate": true, "connections": true, "create_card": true}'
- `connections_enabled` BOOLEAN DEFAULT true
- `auto_scroll` BOOLEAN DEFAULT true
- `created_at` TIMESTAMP DEFAULT NOW()
- `updated_at` TIMESTAMP DEFAULT NOW()
- UNIQUE(user_id)

**Что создано:**
- ✅ Таблица с constraints
- ✅ Индексы: `idx_ai_outline_settings_user_id`, `idx_ai_outline_settings_provider`
- ✅ RLS включен
- ✅ 4 RLS policies: SELECT, INSERT, UPDATE, DELETE
- ✅ Триггер `update_ai_outline_settings_updated_at`

### 4. Функция `update_updated_at_column()`

**Что сделано:**
- ✅ Создана/обновлена функция для автоматического обновления `updated_at`
- ✅ Используется всеми тремя таблицами через триггеры

---

## 💻 ИЗМЕНЕНИЯ В BACKEND (NestJS)

### 1. Установленные зависимости

**Файл:** `package.json`

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^latest",
    "openai": "^latest"
  }
}
```

**Команда:** `npm install @anthropic-ai/sdk openai`

### 2. Созданная система провайдеров

#### 2.1. Интерфейс провайдера
**Файл:** `src/ai/providers/ai-provider.interface.ts`

```typescript
export interface AIProvider {
  generateContent(prompt: string, settings: AISettings): Promise<AIProviderResponse>;
}

export type AIProviderType = 'gemini' | 'openai' | 'anthropic';
```

#### 2.2. Реализация Gemini провайдера
**Файл:** `src/ai/providers/gemini.provider.ts`

- ✅ Использует `@google/generative-ai`
- ✅ Читает `GEMINI_API_KEY` из ConfigService
- ✅ Поддерживает настройки temperature и max_tokens

#### 2.3. Реализация OpenAI провайдера
**Файл:** `src/ai/providers/openai.provider.ts`

- ✅ Использует `openai` SDK
- ✅ Читает `OPENAI_API_KEY` из ConfigService
- ✅ Поддерживает chat completions API
- ✅ Ленивая инициализация (не падает если ключ не настроен)

#### 2.4. Реализация Anthropic провайдера
**Файл:** `src/ai/providers/anthropic.provider.ts`

- ✅ Использует `@anthropic-ai/sdk`
- ✅ Читает `ANTHROPIC_API_KEY` из ConfigService
- ✅ Поддерживает messages API
- ✅ Ленивая инициализация (не падает если ключ не настроен)

#### 2.5. Фабрика провайдеров
**Файл:** `src/ai/providers/ai-provider.factory.ts`

- ✅ Создает провайдеры по требованию
- ✅ Автоматический fallback на Gemini при ошибках других провайдеров
- ✅ Проверка доступности провайдеров
- ✅ Логирование использования провайдеров

### 3. Новые Entities

#### 3.1. AIChatSettings
**Файл:** `src/ai/entities/ai-chat-settings.entity.ts`

```typescript
export interface AIChatSettings {
  id?: number;
  user_id: string;
  provider: 'gemini' | 'openai' | 'anthropic';
  model: string;
  temperature: number;
  max_tokens: number;
  created_at?: string;
  updated_at?: string;
}
```

#### 3.2. AIOutlineSettings
**Файл:** `src/ai/entities/ai-outline-settings.entity.ts`

```typescript
export interface AIOutlineSettings {
  id?: number;
  user_id: string;
  provider: 'gemini' | 'openai' | 'anthropic';
  model: string;
  temperature: number;
  default_actions: AIOutlineDefaultActions;
  connections_enabled: boolean;
  auto_scroll: boolean;
  created_at?: string;
  updated_at?: string;
}
```

#### 3.3. Обновлен AISettings
**Файл:** `src/ai/entities/ai-settings.entity.ts`

- ✅ Добавлено поле `provider?: 'gemini' | 'openai' | 'anthropic'`

### 4. Новые DTOs

#### 4.1. UpdateAIChatSettingsDto
**Файл:** `src/ai/dto/ai-chat-settings.dto.ts`

- ✅ Валидация provider (gemini/openai/anthropic)
- ✅ Валидация temperature (0.0-2.0)
- ✅ Валидация max_tokens (1-8192)

#### 4.2. UpdateAIOutlineSettingsDto
**Файл:** `src/ai/dto/ai-outline-settings.dto.ts`

- ✅ Валидация provider (gemini/openai/anthropic)
- ✅ Валидация temperature (0.0-2.0)
- ✅ Валидация default_actions (JSONB)
- ✅ Валидация boolean полей

#### 4.3. Обновлен UpdateAISettingsDto
**Файл:** `src/ai/dto/ai-settings.dto.ts`

- ✅ Добавлено поле `provider?: 'gemini' | 'openai' | 'anthropic'` с валидацией

### 5. Рефакторинг AIService

**Файл:** `src/ai/ai.service.ts`

#### 5.1. Изменения в конструкторе:
- ✅ Добавлен `AIProviderFactory` в зависимости

#### 5.2. Замена метода:
- ❌ Удален: `callGeminiAPI()`
- ✅ Добавлен: `callAIProvider()` - универсальный метод с поддержкой всех провайдеров
- ✅ Автоматический fallback на Gemini при ошибках

#### 5.3. Новые методы:

**getChatSettings(userId: string): Promise<AIChatSettings>**
- Получает настройки чата из `ai_chat_settings`
- Возвращает default значения если записи нет

**updateChatSettings(userId: string, dto: UpdateAIChatSettingsDto): Promise<AIChatSettings>**
- Сохраняет/обновляет настройки чата
- Использует upsert (ON CONFLICT user_id)

**getOutlineSettings(userId: string): Promise<AIOutlineSettings>**
- Получает настройки outline из `ai_outline_settings`
- Возвращает default значения если записи нет

**updateOutlineSettings(userId: string, dto: UpdateAIOutlineSettingsDto): Promise<AIOutlineSettings>**
- Сохраняет/обновляет настройки outline
- Использует upsert (ON CONFLICT user_id)

**getDefaultChatSettings(userId: string): AIChatSettings**
- Возвращает default настройки для чата

**getDefaultOutlineSettings(userId: string): AIOutlineSettings**
- Возвращает default настройки для outline

#### 5.4. Обновленные методы:

**getDefaultSettings(userId: string): AISettings**
- ✅ Добавлено `provider: 'gemini'` в default значения

**generateRecommendations()**
- ✅ Использует `callAIProvider()` вместо `callGeminiAPI()`
- ✅ Поддерживает все провайдеры из settings

**generateGoalsForProject()**
- ✅ Использует `callAIProvider()` вместо `callGeminiAPI()`

**generateTasksForGoal()**
- ✅ Использует `callAIProvider()` вместо `callGeminiAPI()`

**generateFullStructure()**
- ✅ Использует `callAIProvider()` вместо `callGeminiAPI()`

### 6. Обновление AIController

**Файл:** `src/ai/ai.controller.ts`

#### 6.1. Новые endpoints:

**GET /ai/chat-settings**
- Получает настройки чата для текущего пользователя
- Возвращает: `{ success: true, settings: AIChatSettings }`

**POST /ai/chat-settings**
- Сохраняет настройки чата для текущего пользователя
- Body: `UpdateAIChatSettingsDto`
- Возвращает: `{ success: true, settings: AIChatSettings }`

**GET /ai/outline-settings**
- Получает настройки outline для текущего пользователя
- Возвращает: `{ success: true, settings: AIOutlineSettings }`

**POST /ai/outline-settings**
- Сохраняет настройки outline для текущего пользователя
- Body: `UpdateAIOutlineSettingsDto`
- Возвращает: `{ success: true, settings: AIOutlineSettings }`

#### 6.2. Обновленные endpoints:

**GET /ai/settings**
- ✅ Теперь возвращает `provider` в ответе

**POST /ai/settings**
- ✅ Теперь принимает `provider` в DTO
- ✅ Валидирует provider (gemini/openai/anthropic)

### 7. Обновление AIModule

**Файл:** `src/ai/ai.module.ts`

- ✅ Добавлен `AIProviderFactory` в providers
- ✅ Экспортируется для использования в других модулях

---

## 🔐 ENVIRONMENT VARIABLES

### Для Production (Render/Railway):

**Добавлены переменные:**
- ✅ `OPENAI_API_KEY` - ключ OpenAI API
- ✅ `ANTHROPIC_API_KEY` - ключ Anthropic API
- ✅ `GEMINI_API_KEY` - ключ Google Gemini API (уже был)

**Где добавить:**
- Render: Dashboard → Environment → Add Environment Variable
- Railway: Dashboard → Variables → New Variable

**Важно:** После добавления переменных нужно перезапустить сервис!

### Для Local Development (.env):

**Создайте файл `.env` в корне проекта:**

```env
# AI Providers API Keys
GEMINI_API_KEY=your_gemini_key_here
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here

# Другие переменные...
```

**Важно:**
- ✅ Добавьте `.env` в `.gitignore` (если еще не добавлен)
- ✅ НЕ коммитьте `.env` в Git
- ✅ Используйте `.env.example` для документации (без реальных ключей)

---

## 📊 СТРУКТУРА ФАЙЛОВ

### Новые файлы:

```
src/ai/
├── providers/
│   ├── ai-provider.interface.ts          [НОВЫЙ]
│   ├── gemini.provider.ts                [НОВЫЙ]
│   ├── openai.provider.ts                 [НОВЫЙ]
│   ├── anthropic.provider.ts              [НОВЫЙ]
│   └── ai-provider.factory.ts             [НОВЫЙ]
├── entities/
│   ├── ai-chat-settings.entity.ts        [НОВЫЙ]
│   └── ai-outline-settings.entity.ts     [НОВЫЙ]
└── dto/
    ├── ai-chat-settings.dto.ts            [НОВЫЙ]
    └── ai-outline-settings.dto.ts         [НОВЫЙ]
```

### Обновленные файлы:

```
src/ai/
├── ai.service.ts                          [ОБНОВЛЕН]
├── ai.controller.ts                      [ОБНОВЛЕН]
├── ai.module.ts                          [ОБНОВЛЕН]
├── entities/
│   └── ai-settings.entity.ts             [ОБНОВЛЕН]
└── dto/
    └── ai-settings.dto.ts                 [ОБНОВЛЕН]
```

### SQL файлы:

```
database_migration_ai_providers.sql        [НОВЫЙ]
database_check_ai_providers.sql           [НОВЫЙ]
```

### Документация:

```
API_KEYS_SETUP_GUIDE.md                    [НОВЫЙ]
DATABASE_MIGRATION_AI_PROVIDERS_README.md  [НОВЫЙ]
AI_PROVIDERS_IMPLEMENTATION_SUMMARY.md    [НОВЫЙ]
```

---

## ✅ ЧЕКЛИСТ ВЫПОЛНЕНИЯ

### База данных:
- ✅ Колонка `provider` добавлена в `ai_settings`
- ✅ Таблица `ai_chat_settings` создана
- ✅ Таблица `ai_outline_settings` создана
- ✅ Все constraints созданы
- ✅ Все индексы созданы
- ✅ RLS policies настроены
- ✅ Триггеры созданы

### Backend:
- ✅ Зависимости установлены
- ✅ Система провайдеров создана
- ✅ Entities созданы
- ✅ DTOs созданы
- ✅ AIService рефакторен
- ✅ Новые endpoints добавлены
- ✅ AIModule обновлен

### Environment:
- ✅ `OPENAI_API_KEY` добавлен в Render
- ✅ `ANTHROPIC_API_KEY` добавлен в Render
- ✅ `GEMINI_API_KEY` проверен в Render
- ⚠️ `.env` создан для локальной разработки (опционально)

---

## 🚀 ГОТОВО К ИСПОЛЬЗОВАНИЮ

После выполнения всех шагов:

1. ✅ Backend поддерживает 3 провайдера (Gemini, OpenAI, Anthropic)
2. ✅ Пользователи могут выбирать провайдера для каждой системы отдельно
3. ✅ Настройки сохраняются независимо для Recommendations, Chat и Outline
4. ✅ Автоматический fallback на Gemini при ошибках других провайдеров
5. ✅ Все данные защищены RLS policies

---

## 📝 ПРИМЕЧАНИЯ

- **Обратная совместимость:** Все существующие endpoints работают без изменений
- **Fallback:** Если провайдер недоступен, автоматически используется Gemini
- **Безопасность:** Все таблицы защищены RLS, пользователи видят только свои данные
- **Валидация:** Все входные данные валидируются через DTOs
- **Логирование:** Использование провайдеров логируется для мониторинга

---

## 🔄 СЛЕДУЮЩИЕ ШАГИ (Frontend)

После завершения backend интеграции, frontend должен:

1. Создать универсальный список моделей (`ai-models.js`)
2. Реструктурировать AI Settings в хаб с табами
3. Создать компоненты для каждого подраздела
4. Обновить `aiService.js` с новыми методами
5. Создать BFF endpoints
6. Обновить AI Chat для использования настроек
7. Обновить переводы

---

**Дата реализации:** 2024  
**Статус:** ✅ Завершено

