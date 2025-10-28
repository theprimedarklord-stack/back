# Миграция схем БД - Завершена ✅

## Проблема
Backend обращался к таблицам без указания схемы, поэтому искал их в `public` схеме. Но таблицы находятся в схемах `project` и `ai`.

## Решение
Обновлены все запросы в 4 сервисах с указанием правильных схем.

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
.from('ai.ai_settings')
.from('ai.ai_recommendations_cache')
.from('project.goals')
.from('project.tasks')
.from('project.projects')
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
.from('project.projects')
.from('project.goals')
.from('project.tasks')
```

### 3. ✅ `src/goals/goals.service.ts` (16 мест)

**Было:**
```typescript
.from('goals')
.from('goal_subgoals')
```

**Стало:**
```typescript
.from('project.goals')
.from('project.goal_subgoals')
```

### 4. ✅ `src/tasks/tasks.service.ts` (5 мест)

**Было:**
```typescript
.from('tasks')
```

**Стало:**
```typescript
.from('project.tasks')
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

