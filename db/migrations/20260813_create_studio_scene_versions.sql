-- db/migrations/20260813_create_studio_scene_versions.sql
-- =============================================================================
-- studio_scene_versions — история версий сцен редактора /studio.
--
-- ЧТО РЕШАЕТ: до сих пор колонка studio_scenes.version инкрементировалась, но
-- прошлые состояния не хранились. Испортил сцену и сохранил — вернуть нечем.
--
-- КАК УСТРОЕНО: снимок делает ТРИГГЕР на UPDATE studio_scenes, а не код
-- бекенда. Причина — атомарность: снимок предыдущего состояния и инкремент
-- version происходят в одной транзакции, поэтому потерять версию из-за сбоя
-- между двумя запросами невозможно. Плюс история наполняется одинаково, кто
-- бы сцену ни менял, включая ручные правки через SQL.
--
-- В версию пишется СТАРОЕ состояние (OLD), а не новое. Текущее всегда лежит в
-- самой studio_scenes, дублировать его в истории незачем.
--
-- ПРОРЕЖИВАНИЕ. Версия создаётся не на каждое сохранение: если предыдущая
-- точка восстановления моложе 5 минут — новая не пишется. Сохраняется при
-- этом СТАРАЯ (она дальше от текущего момента, значит полезнее для отката).
-- Плюс на сцену держим последние 50 версий. Без этого Ctrl+S раз в минуту за
-- день работы даёт сотни строк, список становится нечитаемым, а размер БД
-- растёт неограниченно.
--
-- Конвенции RLS взяты из 20260129_add_rls_app_org.sql.
-- Инструкция по применению — SmartMemory--NextJS/STUDIO_SETUP.txt, ЧАСТЬ 7.
-- =============================================================================

CREATE TABLE IF NOT EXISTS studio_scene_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE CASCADE: история без сцены смысла не имеет. Это единственное
  -- место, где мусор убирается сам — файлы в Storage так по-прежнему не
  -- чистятся (см. ЧАСТЬ 6 инструкции).
  scene_id        uuid NOT NULL REFERENCES studio_scenes(id) ON DELETE CASCADE,

  -- Дублируется из сцены СОЗНАТЕЛЬНО: политика RLS должна проверяться без
  -- присоединения studio_scenes, иначе на каждую строку истории пришёлся бы
  -- подзапрос.
  organization_id uuid NOT NULL,

  version         integer NOT NULL,       -- номер версии, которую снимок хранит
  name            text NOT NULL,          -- имя сцены на момент снимка
  data            jsonb NOT NULL,         -- само состояние сцены
  created_by      text,                   -- кто внёс правку (Cognito sub)
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Список версий сцены, свежие сверху. Он же обслуживает прореживание и
-- отсечку последних 50.
CREATE INDEX IF NOT EXISTS idx_studio_scene_versions_scene_created
  ON studio_scene_versions (scene_id, created_at DESC);

-- Функция снимка -------------------------------------------------------------
--
-- SECURITY DEFINER НЕ используется намеренно: триггер должен исполняться с
-- правами вызывающей роли, чтобы RLS на studio_scene_versions применялась.
-- Вставка проходит WITH CHECK, потому что organization_id берётся из самой
-- сцены и равен контексту app.org_id.
CREATE OR REPLACE FUNCTION studio_scenes_archive_version()
RETURNS trigger AS $$
DECLARE
  last_snapshot_at timestamptz;
BEGIN
  -- Переименование сцены содержимое не меняет — версию не плодим.
  IF NEW.data IS NOT DISTINCT FROM OLD.data THEN
    RETURN NEW;
  END IF;

  SELECT max(created_at) INTO last_snapshot_at
  FROM studio_scene_versions
  WHERE scene_id = OLD.id;

  -- Прореживание: свежая точка восстановления уже есть.
  IF last_snapshot_at IS NOT NULL
     AND last_snapshot_at > now() - interval '5 minutes' THEN
    RETURN NEW;
  END IF;

  INSERT INTO studio_scene_versions
    (scene_id, organization_id, version, name, data, created_by)
  VALUES
    (OLD.id,
     OLD.organization_id,
     OLD.version,
     OLD.name,
     OLD.data,
     -- current_setting(..., true) возвращает NULL вместо ошибки, если контекст
     -- не выставлен: миграции и ручные правки через SQL Editor тогда не падают.
     COALESCE(NULLIF(current_setting('app.user_id', true), ''), OLD.owner_id));

  -- Держим последние 50 версий на сцену.
  DELETE FROM studio_scene_versions
  WHERE scene_id = OLD.id
    AND id NOT IN (
      SELECT id
      FROM studio_scene_versions
      WHERE scene_id = OLD.id
      ORDER BY created_at DESC
      LIMIT 50
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер ---------------------------------------------------------------------
-- AFTER UPDATE: снимок делается после того, как строка успешно обновилась.
DROP TRIGGER IF EXISTS trg_studio_scenes_archive_version ON studio_scenes;
CREATE TRIGGER trg_studio_scenes_archive_version
  AFTER UPDATE ON studio_scenes
  FOR EACH ROW
  EXECUTE FUNCTION studio_scenes_archive_version();

-- RLS -------------------------------------------------------------------------
ALTER TABLE studio_scene_versions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_scene_versions'
      AND policyname = 'studio_scene_versions_org_isolation'
  ) THEN
    CREATE POLICY studio_scene_versions_org_isolation ON studio_scene_versions
      FOR ALL
      USING      (organization_id = get_app_org_id())
      WITH CHECK (organization_id = get_app_org_id());
  END IF;
END $$;

-- Права -----------------------------------------------------------------------
-- Явно, а не в расчёте на ALTER DEFAULT PRIVILEGES: неизвестно, была ли та
-- команда выполнена в этой базе. Повторная выдача прав безвредна.
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_scene_versions TO app_backend;
