-- ==============================
-- Повна RLS міграція для org_* таблиць
-- Включає: INSERT/UPDATE/DELETE політики + triggers для auto-owner
-- Виконати в Supabase SQL Editor (таблиці вже створено)
-- ==============================

-- ==============================
-- 1️⃣ Індекси для performance
-- ==============================
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_project_members_user_id ON org_project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_project_members_project_id ON org_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_org_projects_org_id ON org_projects(organization_id);

-- ==============================
-- 2️⃣ Helper функція для отримання поточного user_id
-- ==============================
CREATE OR REPLACE FUNCTION get_current_user_id() 
RETURNS uuid AS $$
BEGIN
    RETURN current_setting('app.current_user_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================
-- 3️⃣ Helper функція для перевірки ролі в org
-- ==============================
CREATE OR REPLACE FUNCTION user_has_org_role(org_id uuid, required_roles text[]) 
RETURNS boolean AS $$
DECLARE
    user_role text;
BEGIN
    SELECT role INTO user_role
    FROM org_organization_members
    WHERE organization_id = org_id
      AND user_id = get_current_user_id();
    
    RETURN user_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================
-- 4️⃣ Helper функція для перевірки ролі в project
-- ==============================
CREATE OR REPLACE FUNCTION user_has_project_role(proj_id uuid, required_roles text[]) 
RETURNS boolean AS $$
DECLARE
    user_role text;
BEGIN
    SELECT role INTO user_role
    FROM org_project_members
    WHERE project_id = proj_id
      AND user_id = get_current_user_id();
    
    RETURN user_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================
-- 5️⃣ Trigger функція: auto-add owner при створенні org
-- ==============================
CREATE OR REPLACE FUNCTION auto_add_org_owner()
RETURNS trigger AS $$
BEGIN
    INSERT INTO org_organization_members (organization_id, user_id, role)
    VALUES (NEW.id, NEW.created_by_user_id, 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Видалити старий trigger якщо існує
DROP TRIGGER IF EXISTS trg_auto_org_owner ON org_organizations;

-- Створити trigger
CREATE TRIGGER trg_auto_org_owner
    AFTER INSERT ON org_organizations
    FOR EACH ROW
    EXECUTE FUNCTION auto_add_org_owner();

-- ==============================
-- 6️⃣ Trigger функція: auto-add project_owner при створенні project
-- ==============================
CREATE OR REPLACE FUNCTION auto_add_project_owner()
RETURNS trigger AS $$
BEGIN
    INSERT INTO org_project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.created_by_user_id, 'project_owner')
    ON CONFLICT (project_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Видалити старий trigger якщо існує
DROP TRIGGER IF EXISTS trg_auto_project_owner ON org_projects;

-- Створити trigger
CREATE TRIGGER trg_auto_project_owner
    AFTER INSERT ON org_projects
    FOR EACH ROW
    EXECUTE FUNCTION auto_add_project_owner();

-- ==============================
-- 7️⃣ RLS політики для org_organizations
-- ==============================

-- Видалити старі політики якщо існують
DROP POLICY IF EXISTS select_org ON org_organizations;
DROP POLICY IF EXISTS insert_org ON org_organizations;
DROP POLICY IF EXISTS update_org ON org_organizations;
DROP POLICY IF EXISTS delete_org ON org_organizations;

-- SELECT: бачить тільки org де є членом
CREATE POLICY select_org ON org_organizations
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM org_organization_members m
        WHERE m.organization_id = org_organizations.id
          AND m.user_id = get_current_user_id()
    )
);

-- INSERT: будь-який авторизований користувач може створити org
CREATE POLICY insert_org ON org_organizations
FOR INSERT WITH CHECK (
    created_by_user_id = get_current_user_id()
);

-- UPDATE: тільки owner може оновлювати org
CREATE POLICY update_org ON org_organizations
FOR UPDATE USING (
    user_has_org_role(id, ARRAY['owner'])
);

-- DELETE: тільки owner може видаляти org
CREATE POLICY delete_org ON org_organizations
FOR DELETE USING (
    user_has_org_role(id, ARRAY['owner'])
);

-- ==============================
-- 8️⃣ RLS політики для org_organization_members
-- ==============================

DROP POLICY IF EXISTS select_org_members ON org_organization_members;
DROP POLICY IF EXISTS insert_org_members ON org_organization_members;
DROP POLICY IF EXISTS update_org_members ON org_organization_members;
DROP POLICY IF EXISTS delete_org_members ON org_organization_members;

-- SELECT: бачить членів org де сам є членом
CREATE POLICY select_org_members ON org_organization_members
FOR SELECT USING (
    user_id = get_current_user_id()
    OR organization_id IN (
        SELECT organization_id FROM org_organization_members
        WHERE user_id = get_current_user_id()
    )
);

-- INSERT: owner/admin можуть додавати членів
CREATE POLICY insert_org_members ON org_organization_members
FOR INSERT WITH CHECK (
    user_has_org_role(organization_id, ARRAY['owner', 'admin'])
);

-- UPDATE: тільки owner може змінювати ролі
CREATE POLICY update_org_members ON org_organization_members
FOR UPDATE USING (
    user_has_org_role(organization_id, ARRAY['owner'])
);

-- DELETE: owner може видаляти будь-кого, або сам себе (leave org)
CREATE POLICY delete_org_members ON org_organization_members
FOR DELETE USING (
    user_has_org_role(organization_id, ARRAY['owner'])
    OR user_id = get_current_user_id()
);

-- ==============================
-- 9️⃣ RLS політики для org_projects
-- ==============================

DROP POLICY IF EXISTS select_projects ON org_projects;
DROP POLICY IF EXISTS insert_projects ON org_projects;
DROP POLICY IF EXISTS update_projects ON org_projects;
DROP POLICY IF EXISTS delete_projects ON org_projects;

-- SELECT: бачить проекти org де є членом org
CREATE POLICY select_projects ON org_projects
FOR SELECT USING (
    organization_id IN (
        SELECT organization_id FROM org_organization_members
        WHERE user_id = get_current_user_id()
    )
);

-- INSERT: owner/admin org можуть створювати проекти
CREATE POLICY insert_projects ON org_projects
FOR INSERT WITH CHECK (
    user_has_org_role(organization_id, ARRAY['owner', 'admin'])
    AND created_by_user_id = get_current_user_id()
);

-- UPDATE: project_owner/project_admin можуть оновлювати
CREATE POLICY update_projects ON org_projects
FOR UPDATE USING (
    user_has_project_role(id, ARRAY['project_owner', 'project_admin'])
);

-- DELETE: тільки project_owner може видаляти
CREATE POLICY delete_projects ON org_projects
FOR DELETE USING (
    user_has_project_role(id, ARRAY['project_owner'])
);

-- ==============================
-- 🔟 RLS політики для org_project_members
-- ==============================

DROP POLICY IF EXISTS select_project_members ON org_project_members;
DROP POLICY IF EXISTS insert_project_members ON org_project_members;
DROP POLICY IF EXISTS update_project_members ON org_project_members;
DROP POLICY IF EXISTS delete_project_members ON org_project_members;

-- SELECT: бачить членів проектів своїх org
CREATE POLICY select_project_members ON org_project_members
FOR SELECT USING (
    project_id IN (
        SELECT p.id FROM org_projects p
        JOIN org_organization_members m ON p.organization_id = m.organization_id
        WHERE m.user_id = get_current_user_id()
    )
);

-- INSERT: project_owner/project_admin можуть додавати членів
CREATE POLICY insert_project_members ON org_project_members
FOR INSERT WITH CHECK (
    user_has_project_role(project_id, ARRAY['project_owner', 'project_admin'])
);

-- UPDATE: тільки project_owner може змінювати ролі
CREATE POLICY update_project_members ON org_project_members
FOR UPDATE USING (
    user_has_project_role(project_id, ARRAY['project_owner'])
);

-- DELETE: project_owner може видаляти будь-кого, або сам себе (leave project)
CREATE POLICY delete_project_members ON org_project_members
FOR DELETE USING (
    user_has_project_role(project_id, ARRAY['project_owner'])
    OR user_id = get_current_user_id()
);

-- ==============================
-- 1️⃣1️⃣ RLS для org_permissions (read-only для всіх auth users)
-- ==============================

ALTER TABLE org_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_permissions ON org_permissions;

CREATE POLICY select_permissions ON org_permissions
FOR SELECT USING (true);  -- Всі авторизовані можуть читати permissions

-- ==============================
-- 1️⃣2️⃣ Функція для SET LOCAL контексту (викликається з NestJS)
-- ==============================
CREATE OR REPLACE FUNCTION set_rls_context(p_user_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id::text, true);
    IF p_org_id IS NOT NULL THEN
        PERFORM set_config('app.current_org_id', p_org_id::text, true);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================
-- ✅ Перевірка: всі політики створено
-- ==============================
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename LIKE 'org_%'
ORDER BY tablename, cmd;
