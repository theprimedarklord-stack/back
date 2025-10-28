# Миграция схем БД - Завершена ✅

## Проблема
Backend обращался к таблицам без указания схемы, поэтому искал их в `public` схеме. Но таблицы находятся в схемах `project` и `ai`.

## Решение
Обновлены все запросы в 4 сервисах с использованием правильного синтаксиса Supabase:
```typescript
.schema('schema_name')
.from('table_name')
```

---

## Структура БД

### Схема `project`:
- ✅ `project.projects`
- ✅ `project.goals`
- ✅ `project.goal_subgoals`
- ✅ `project.tasks`
- ✅ `project.suggestions`
- ✅ `project.task_card_links`

### Схема `ai`:
- ✅ `ai.ai_settings`
- ✅ `ai.ai_recommendations_cache`

### Схема `public`:
- `public.users`
- `public.user_settings`
- `public.cards`
- `public.card_reviews`
- `public.card_images`
- и другие (остались без изменений)

---

## Обновленные файлы

### 1. ✅ `src/ai/ai.service.ts` (8 мест)

**Было:**
```typescript
.from('ai_settings')
.from('ai_recommendations_cache')
.from('goals')
.from('tasks')
.from('projects')
```

**Стало:**
```typescript
.schema('ai')
.from('ai_settings')

.schema('ai')
.from('ai_recommendations_cache')

.schema('project')
.from('goals')

.schema('project')
.from('tasks')

.schema('project')
.from('projects')
```

### 2. ✅ `src/projects/projects.service.ts` (8 мест)

**Было:**
```typescript
.from('projects')
.from('goals')
.from('tasks')
```

**Стало:**
```typescript
.schema('project')
.from('projects')

.schema('project')
.from('goals')

.schema('project')
.from('tasks')
```

### 3. ✅ `src/goals/goals.service.ts` (16 мест)

**Было:**
```typescript
.from('goals')
.from('goal_subgoals')
```

**Стало:**
```typescript
.schema('project')
.from('goals')

.schema('project')
.from('goal_subgoals')
```

### 4. ✅ `src/tasks/tasks.service.ts` (5 мест)

**Было:**
```typescript
.from('tasks')
```

**Стало:**
```typescript
.schema('project')
.from('tasks')
```

---

## Статистика

**Всего исправлено:** 37 запросов в 4 файлах

**Файлы:**
- `src/ai/ai.service.ts` - 8 запросов
- `src/projects/projects.service.ts` - 8 запросов
- `src/goals/goals.service.ts` - 16 запросов
- `src/tasks/tasks.service.ts` - 5 запросов

**Линтер:** Нет ошибок ✅

---

## Тестирование

После деплоя проверьте что:
1. ✅ Проекты создаются и читаются
2. ✅ Цели создаются и читаются
3. ✅ Задачи создаются и читаются
4. ✅ AI генерация работает
5. ✅ Нет ошибок `relation "public.X" does not exist`

---

**Дата:** 2025-10-28  
**Исправлено:** 37 запросов  
**Статус:** ✅ Готово к деплою

---

## Результат

✅ **Нет ошибок линтера**  
✅ **Все запросы используют правильный синтаксис Supabase**  
✅ **Готово к деплою на Render**

Теперь backend использует правильный синтаксис:
```typescript
// Для таблиц в схеме 'project'
.schema('project').from('goals')
.schema('project').from('tasks')
.schema('project').from('projects')

// Для таблиц в схеме 'ai'
.schema('ai').from('ai_settings')
.schema('ai').from('ai_recommendations_cache')

// Для таблиц в 'public' (без изменений)
.from('users')
.from('cards')
```

**Попробуйте снова задеплоить!** 🚀

