-- Миграция для добавления поля status_history в таблицу tasks
-- Выполните этот SQL-запрос в вашей базе данных

ALTER TABLE tasks ADD COLUMN status_history JSON DEFAULT '[]';

-- Обновляем существующие записи, добавляя начальную запись в историю
UPDATE tasks 
SET status_history = jsonb_build_array(
  jsonb_build_object(
    'status', status,
    'timestamp', created_at,
    'action', 'created'
  )
)
WHERE status_history IS NULL OR status_history = '[]';