# Cognito + Multi-tenant Organizations Setup

## Environment Variables (add to .env)

```env
# AWS Cognito Configuration
COGNITO_REGION=eu-central-1
COGNITO_USER_POOL_ID=eu-central-1_XXXXXXXXX
COGNITO_CLIENT_ID=your-app-client-id
```

## SQL Migration (already in database_migration_org_rls_complete.sql)

Run the complete migration in Supabase SQL Editor:
- Creates tables: org_organizations, org_organization_members, org_projects, org_project_members, org_permissions
- Enables RLS with full SELECT/INSERT/UPDATE/DELETE policies
- Creates triggers for auto-owner assignment
- Creates helper functions (get_current_user_id, set_rls_context, etc.)

---

-- ==============================
-- 1️⃣ Организации
-- ==============================
CREATE TABLE IF NOT EXISTS org_organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_by_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at timestamp DEFAULT now()
);

-- ==============================
-- 2️⃣ Члены организаций
-- ==============================
CREATE TABLE IF NOT EXISTS org_organization_members (
    organization_id uuid NOT NULL REFERENCES org_organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role varchar CHECK (role IN ('owner', 'admin', 'member')) NOT NULL DEFAULT 'member',
    created_at timestamp DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

-- ==============================
-- 3️⃣ Проекты
-- ==============================
CREATE TABLE IF NOT EXISTS org_projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES org_organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_by_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at timestamp DEFAULT now()
);

-- ==============================
-- 4️⃣ Члены проектов
-- ==============================
CREATE TABLE IF NOT EXISTS org_project_members (
    project_id uuid NOT NULL REFERENCES org_projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role varchar CHECK (role IN ('project_owner', 'project_admin', 'project_member', 'viewer')) NOT NULL DEFAULT 'viewer',
    created_at timestamp DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

-- ==============================
-- 5️⃣ Включаем RLS
-- ==============================
ALTER TABLE org_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_project_members ENABLE ROW LEVEL SECURITY;

-- ==============================
-- 6️⃣ Примеры базовых политик RLS
-- ==============================

-- org_organizations: юзер видит только свои организации
CREATE POLICY select_org ON org_organizations
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM org_organization_members m
        WHERE m.organization_id = org_organizations.id
          AND m.user_id = current_setting('app.current_user_id')::uuid
    )
);

-- org_organization_members: видит только свою организацию
CREATE POLICY select_org_members ON org_organization_members
FOR SELECT
USING (
    user_id = current_setting('app.current_user_id')::uuid
    OR organization_id IN (
        SELECT organization_id FROM org_organization_members
        WHERE user_id = current_setting('app.current_user_id')::uuid
    )
);

-- org_projects: видит проекты только своих организаций
CREATE POLICY select_projects ON org_projects
FOR SELECT
USING (
    organization_id IN (
        SELECT organization_id FROM org_organization_members
        WHERE user_id = current_setting('app.current_user_id')::uuid
    )
);

-- org_project_members: видит участников проектов своих организаций
CREATE POLICY select_project_members ON org_project_members
FOR SELECT
USING (
    project_id IN (
        SELECT p.id FROM org_projects p
        JOIN org_organization_members m ON p.organization_id = m.organization_id
        WHERE m.user_id = current_setting('app.current_user_id')::uuid
    )
);


-- Категории и пермишены организации
CREATE TABLE org_permissions (
    id SERIAL PRIMARY KEY,
    entity_type varchar NOT NULL,      -- 'organization' | 'project'
    role varchar NOT NULL,             -- owner, admin, member, viewer, editor, commenter
    action varchar NOT NULL,           -- например: 'projects.create', 'members.invite'
    UNIQUE(entity_type, role, action)
);

-- Пример заполнения
INSERT INTO org_permissions (entity_type, role, action) VALUES
('organization','owner','projects.create'),
('organization','owner','members.invite'),
('organization','admin','projects.create'),
('organization','admin','members.invite'),
('organization','member','projects.view'),
('organization','viewer','projects.view'),
('project','project_owner','content.create'),
('project','project_owner','content.edit'),
('project','project_member','content.comment'),
('project','viewer','content.view');
