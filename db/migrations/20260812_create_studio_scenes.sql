-- db/migrations/20260812_create_studio_scenes.sql
-- =============================================================================
-- studio_scenes / studio_assets
-- Раздел /studio: 3D-редактор моделей на Babylon.js.
--
-- Разделение данных:
--   файлы моделей (.glb/.gltf) → Supabase Storage, бакет studio-models
--   описание сцены            → studio_scenes.data (jsonb)
--
-- Конвенции RLS взяты из 20260129_add_rls_app_org.sql.
-- Инструкция по настройке — SmartMemory--NextJS/STUDIO_SETUP.txt
-- =============================================================================

-- Сцены редактора -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS studio_scenes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  owner_id        text NOT NULL,          -- Cognito sub (sessionData.sub_id)
  name            text NOT NULL DEFAULT 'Untitled scene',

  -- Граф сцены: узлы, иерархия, трансформации, материалы, камера
  -- и ССЫЛКИ на studio_assets.id. Без ссылок сцена не восстановится:
  -- останутся координаты объектов, которых неоткуда взять.
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,

  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Список сцен организации, свежие сверху
CREATE INDEX IF NOT EXISTS idx_studio_scenes_org_updated
  ON studio_scenes (organization_id, updated_at DESC);

-- Загруженные файлы моделей ---------------------------------------------------
CREATE TABLE IF NOT EXISTS studio_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  owner_id        text NOT NULL,
  file_name       text NOT NULL,          -- исходное имя от пользователя
  storage_path    text NOT NULL,          -- {organization_id}/{asset_id}.glb
  mime            text,
  size_bytes      bigint,
  checksum        text,                   -- SHA-256, для дедупликации
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_assets_org
  ON studio_assets (organization_id, created_at DESC);

-- Один и тот же файл в рамках организации не платится дважды
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_assets_org_checksum
  ON studio_assets (organization_id, checksum)
  WHERE checksum IS NOT NULL;

-- RLS -------------------------------------------------------------------------
-- get_app_org_id() читает current_setting('app.org_id'). Контекст выставляет
-- бекенд: DatabaseService.withOrgContext / withUserContext, а также
-- auth/rls-context.interceptor.ts.
--
-- WITH CHECK указан ЯВНО. Postgres при его отсутствии использует USING и для
-- вставки, но для новой таблицы лучше не полагаться на неявное поведение.
--
-- CREATE POLICY не поддерживает IF NOT EXISTS, поэтому обёрнуто в проверку —
-- чтобы миграция оставалась идемпотентной.

ALTER TABLE studio_scenes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_scenes'
      AND policyname = 'studio_scenes_org_isolation'
  ) THEN
    CREATE POLICY studio_scenes_org_isolation ON studio_scenes
      FOR ALL
      USING      (organization_id = get_app_org_id())
      WITH CHECK (organization_id = get_app_org_id());
  END IF;
END $$;

ALTER TABLE studio_assets ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_assets'
      AND policyname = 'studio_assets_org_isolation'
  ) THEN
    CREATE POLICY studio_assets_org_isolation ON studio_assets
      FOR ALL
      USING      (organization_id = get_app_org_id())
      WITH CHECK (organization_id = get_app_org_id());
  END IF;
END $$;
