# 🚀 Инструкция по Запуску Модуля Проектов

## ✅ Что Уже Готово

### Backend (NestJS) - 100% Готово ✅
- ✅ Entity интерфейсы (`src/projects/entities/project.entity.ts`)
- ✅ DTO для создания и обновления (`src/projects/dto/`)
- ✅ Service с CRUD операциями (`src/projects/projects.service.ts`)
- ✅ Controller с REST endpoints (`src/projects/projects.controller.ts`)
- ✅ Module зарегистрирован (`src/projects/projects.module.ts`)
- ✅ Модуль добавлен в `app.module.ts`
- ✅ Goals Service обновлен для поддержки `project_id`
- ✅ Goals DTO обновлены для поддержки `project_id`

### Frontend - 100% Готово (по вашим словам) ✅
- API конфигурация
- Сервис для работы с проектами
- AI алгоритм генерации целей
- Компоненты (карточки, модалки, список)
- Интеграция в AdminReports

---

## 🗄️ Шаг 1: Настройка Базы Данных

### Выполните SQL Миграцию

1. Откройте **Supabase Dashboard** → **SQL Editor**
2. Скопируйте содержимое файла `database_migration_projects.sql`
3. Вставьте в SQL Editor и нажмите **Run**

Этот скрипт:
- Создаст таблицу `projects`
- Создаст необходимые индексы
- Настроит Row Level Security (RLS) политики
- Добавит колонку `project_id` в таблицу `goals`
- Настроит триггеры для автообновления `updated_at`

### Проверка

```sql
-- Проверьте, что таблица создана
SELECT * FROM projects LIMIT 1;

-- Проверьте, что в goals добавлена колонка project_id
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'goals' AND column_name = 'project_id';
```

---

## 🔧 Шаг 2: Запуск Backend

```bash
# Установите зависимости (если не установлены)
npm install

# Запустите в режиме разработки
npm run start:dev
```

### Проверка Логов

В консоли вы должны увидеть:
```
[Nest] Mapped {/projects, POST} route
[Nest] Mapped {/projects, GET} route
[Nest] Mapped {/projects/:id, GET} route
[Nest] Mapped {/projects/:id, PATCH} route
[Nest] Mapped {/projects/:id, DELETE} route
[Nest] Mapped {/projects/:id/goals, GET} route
```

---

## 🧪 Шаг 3: Тестирование API

### 1. Создание Проекта

```bash
POST http://localhost:8080/projects
Content-Type: application/json
Cookie: access_token=YOUR_JWT_TOKEN

{
  "title": "Тестовый проект",
  "description": "Описание проекта",
  "keywords": ["React", "NestJS", "Supabase"],
  "category": "technical",
  "priority": "high",
  "status": "active",
  "deadline": "2024-12-31T23:59:59.000Z"
}
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "project": {
    "id": 1,
    "user_id": "...",
    "title": "Тестовый проект",
    "description": "Описание проекта",
    "keywords": ["React", "NestJS", "Supabase"],
    "category": "technical",
    "priority": "high",
    "status": "active",
    "deadline": "2024-12-31T23:59:59.000Z",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

### 2. Получение Всех Проектов

```bash
GET http://localhost:8080/projects
Cookie: access_token=YOUR_JWT_TOKEN
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "projects": [...]
}
```

### 3. Получение Одного Проекта

```bash
GET http://localhost:8080/projects/1
Cookie: access_token=YOUR_JWT_TOKEN
```

### 4. Обновление Проекта

```bash
PATCH http://localhost:8080/projects/1
Content-Type: application/json
Cookie: access_token=YOUR_JWT_TOKEN

{
  "status": "completed",
  "priority": "medium"
}
```

### 5. Получение Целей Проекта

```bash
GET http://localhost:8080/projects/1/goals
Cookie: access_token=YOUR_JWT_TOKEN
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "goals": [...]
}
```

### 6. Удаление Проекта

```bash
DELETE http://localhost:8080/projects/1
Cookie: access_token=YOUR_JWT_TOKEN
```

---

## 📋 Доступные Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/projects` | Создать проект |
| `GET` | `/projects` | Получить все проекты пользователя |
| `GET` | `/projects/:id` | Получить один проект |
| `PATCH` | `/projects/:id` | Обновить проект |
| `DELETE` | `/projects/:id` | Удалить проект |
| `GET` | `/projects/:id/goals` | Получить цели проекта |
| `GET` | `/projects/categories/list` | Получить список категорий |
| `GET` | `/projects/priorities/list` | Получить список приоритетов |
| `GET` | `/projects/statuses/list` | Получить список статусов |

---

## 🔗 Интеграция с Целями

### Создание Цели с Привязкой к Проекту

```bash
POST http://localhost:8080/goals
Content-Type: application/json
Cookie: access_token=YOUR_JWT_TOKEN

{
  "title": "Frontend разработка",
  "description": "Разработать пользовательский интерфейс",
  "project_id": 1,
  "category": "technical",
  "priority": "high",
  "deadline": "2024-12-15T23:59:59.000Z"
}
```

Теперь цель будет связана с проектом, и вы сможете получить её через `/projects/1/goals`.

---

## 🎨 Типы Данных

### Категории (Category)
- `technical` - Техническая
- `business` - Бизнес
- `personal` - Личная
- `learning` - Обучение

### Приоритеты (Priority)
- `low` - Низкий (🟢 зеленый)
- `medium` - Средний (🟠 оранжевый)
- `high` - Высокий (🔴 красный)
- `critical` - Критический (🔴 темно-красный)

### Статусы (Status)
- `active` - Активный (🔵 синий)
- `completed` - Завершен (🟢 зеленый)
- `on_hold` - На паузе (🟠 оранжевый)
- `cancelled` - Отменен (🔴 красный)

---

## 🐛 Возможные Проблемы

### 1. Ошибка "Проект не найден"
**Причина:** Пытаетесь получить проект другого пользователя или несуществующий проект.
**Решение:** Проверьте `project_id` и что вы авторизованы под правильным пользователем.

### 2. Ошибка "Deadline не может быть в прошлом"
**Причина:** Вы указали дату в прошлом при создании/обновлении.
**Решение:** Используйте будущую дату или не передавайте `deadline`.

### 3. Ошибка 401 Unauthorized
**Причина:** Отсутствует или невалидный JWT токен.
**Решение:** Убедитесь, что передаете `access_token` в cookie или в заголовке `Authorization: Bearer TOKEN`.

### 4. Таблица `projects` не существует
**Причина:** Не выполнена SQL миграция.
**Решение:** Выполните `database_migration_projects.sql` в Supabase SQL Editor.

---

## ✨ Следующие Шаги

1. ✅ **База данных** - выполните миграцию
2. ✅ **Backend** - уже запущен
3. ✅ **Тестирование** - проверьте endpoints
4. 🎨 **Frontend** - должен работать автоматически (по вашим словам уже готов)
5. 🤖 **AI Рекомендации** - протестируйте функцию генерации целей из проектов

---

## 📞 Поддержка

Если возникнут проблемы:
1. Проверьте логи backend: `npm run start:dev`
2. Проверьте логи Supabase в Dashboard
3. Убедитесь, что все переменные окружения установлены (`.env`)

---

**Готово! 🎉 Модуль проектов полностью настроен и готов к использованию!**

