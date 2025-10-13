-- =====================================================
-- МИГРАЦИЯ: Создание таблицы проектов и связи с целями
-- =====================================================

-- 1. Создание таблицы проектов
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  keywords TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'technical',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'active',
  deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Создание индексов для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_deadline ON projects(deadline);
CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority);

-- 3. Включение Row Level Security (важно для безопасности!)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 4. Политики доступа (пользователь видит только свои проекты)
CREATE POLICY "Users can view own projects" 
  ON projects FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" 
  ON projects FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" 
  ON projects FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" 
  ON projects FOR DELETE 
  USING (auth.uid() = user_id);

-- 5. Добавляем колонку project_id в таблицу goals для связи
ALTER TABLE goals 
  ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL;

-- 6. Индекс для быстрого поиска целей по проекту
CREATE INDEX IF NOT EXISTS idx_goals_project_id ON goals(project_id);

-- 7. Функция для автообновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Триггер на таблицу projects
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at 
  BEFORE UPDATE ON projects
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ПРОВЕРКА УСТАНОВКИ
-- =====================================================

-- Проверьте, что таблица создана
-- SELECT * FROM projects LIMIT 1;

-- Проверьте политики
-- SELECT * FROM pg_policies WHERE tablename = 'projects';

-- Проверьте индексы
-- SELECT indexname FROM pg_indexes WHERE tablename = 'projects';

-- Проверьте, что в goals добавлена колонка project_id
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'project_id';

