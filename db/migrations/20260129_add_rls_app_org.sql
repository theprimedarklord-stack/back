-- db/migrations/20260129_add_rls_app_org.sql
-- Add helper and RLS policies to scope rows by current_setting('app.org_id')

-- Function to read app.org_id (returns NULL if not set)
CREATE OR REPLACE FUNCTION get_app_org_id() RETURNS uuid AS $$
  SELECT current_setting('app.org_id', true)::uuid;
$$ LANGUAGE sql STABLE;

-- Enable RLS and policies on organization-scoped tables
-- org_projects
ALTER TABLE org_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_projects_org_isolation ON org_projects
  USING (organization_id = get_app_org_id());

-- org_project_members
ALTER TABLE org_project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_project_members_org_isolation ON org_project_members
  USING (project_id IS NOT NULL AND project_id IN (SELECT id FROM org_projects WHERE organization_id = get_app_org_id()));

-- org_organization_members (memberships should be visible only within org)
ALTER TABLE org_organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_organization_members_org_isolation ON org_organization_members
  USING (organization_id = get_app_org_id());

-- org_limits
ALTER TABLE org_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_limits_org_isolation ON org_limits
  USING (org_id = get_app_org_id());

-- org_feature_flags
ALTER TABLE org_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_feature_flags_org_isolation ON org_feature_flags
  USING (org_id = get_app_org_id());

-- org_permissions (if used to read permitted actions per role)
ALTER TABLE org_permissions ENABLE ROW LEVEL SECURITY;
-- org_permissions is a static catalog of permission codes per role.
-- It does not belong to a single org (no organization_id column),
-- so allow read access to this catalog. Writes should be performed by
-- privileged migration/admin flows (service role).
DROP POLICY IF EXISTS org_permissions_org_isolation ON org_permissions;
CREATE POLICY org_permissions_select ON org_permissions
  FOR SELECT
  USING (true);

-- Note: Administrative operations (management endpoints) should run with a privileged
-- connection (service role) or temporarily disable RLS where appropriate.

-- To set the org context for a transaction, use:
-- BEGIN;
-- SELECT set_config('app.org_id', '<org-id-uuid>', true);
-- -- run queries that rely on RLS within this transaction
-- COMMIT;
