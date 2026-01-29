import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { ContextDto } from './dto/context.dto';

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(private db: DatabaseService) {}

  /**
   * Build full context for a user with optional org/project/impersonation
   */
  async build(params: {
    userId: string;
    orgId?: string | null;
    projectId?: string | null;
    impersonatedUserId?: string | null;
  }): Promise<ContextDto> {
    const { userId, orgId, projectId, impersonatedUserId } = params;

    const sql = `
WITH
actor AS (
  SELECT
    u.user_id AS user_id,
    u.user_id AS real_user_id,
    FALSE AS is_impersonated
  FROM users u
  WHERE u.user_id = $1::uuid

  UNION ALL

  SELECT
    iu.user_id AS user_id,
    u.user_id AS real_user_id,
    TRUE AS is_impersonated
  FROM users u
  JOIN users iu ON iu.user_id = $4::uuid
  WHERE u.user_id = $1::uuid
    AND $4::uuid IS NOT NULL
),

actor_final AS (
  SELECT * FROM actor ORDER BY is_impersonated DESC LIMIT 1
),

candidate_orgs AS (
  SELECT
    om.organization_id AS org_id,
    1 AS priority
  FROM org_organization_members om
  WHERE om.user_id = (SELECT user_id FROM actor_final)
    AND om.organization_id = $2::uuid

  UNION ALL

  SELECT
    u.last_active_org_id AS org_id,
    2 AS priority
  FROM users u
  WHERE u.user_id = (SELECT user_id FROM actor_final)
    AND $2::uuid IS NULL
    AND u.last_active_org_id IS NOT NULL

  UNION ALL

  SELECT
    om.organization_id AS org_id,
    3 AS priority
  FROM org_organization_members om
  WHERE om.user_id = (SELECT user_id FROM actor_final)
),

selected_org AS (
  SELECT org_id FROM candidate_orgs ORDER BY priority LIMIT 1
),

org_ctx AS (
  SELECT
    o.id,
    o.name,
    om.role AS org_role
  FROM org_organizations o
  JOIN org_organization_members om ON om.organization_id = o.id
  WHERE o.id = (SELECT org_id FROM selected_org)
    AND om.user_id = (SELECT user_id FROM actor_final)
),

project_ctx AS (
  SELECT
    p.id,
    p.name,
    pm.role AS project_role
  FROM org_projects p
  JOIN org_project_members pm ON pm.project_id = p.id
  WHERE p.id = $3::uuid
    AND p.organization_id = (SELECT id FROM org_ctx)
    AND pm.user_id = (SELECT user_id FROM actor_final)
),

permissions AS (
  SELECT DISTINCT p.action AS code
  FROM org_permissions p
  WHERE (p.entity_type = 'organization' AND p.role = (SELECT org_role FROM org_ctx))
     OR (p.entity_type = 'project' AND p.role = (SELECT project_role FROM project_ctx))
),

limits AS (
  SELECT COALESCE(ol.limits, '{}'::jsonb) AS limits
  FROM org_limits ol
  WHERE ol.org_id = (SELECT id FROM org_ctx)
  LIMIT 1
),

flags AS (
  SELECT COALESCE(of.flags, '{}'::jsonb) AS flags
  FROM org_feature_flags of
  WHERE of.org_id = (SELECT id FROM org_ctx)
  LIMIT 1
)

SELECT jsonb_build_object(
  'actor', jsonb_build_object(
    'userId', af.user_id,
    'realUserId', af.real_user_id,
    'isImpersonated', af.is_impersonated
  ),
  'org', jsonb_build_object('id', oc.id, 'name', oc.name),
  'project', CASE WHEN (SELECT COUNT(*) FROM project_ctx) = 0 THEN NULL ELSE jsonb_build_object('id', pc.id, 'name', pc.name) END,
  'permissions', (SELECT jsonb_agg(code) FROM permissions),
  'limits', (SELECT limits FROM limits),
  'flags', (SELECT flags FROM flags),
  'meta', jsonb_build_object('orgRole', oc.org_role, 'projectRole', pc.project_role)
) AS context
FROM actor_final af
JOIN org_ctx oc ON TRUE
LEFT JOIN project_ctx pc ON TRUE;
`;

    try {
      const res = await this.db.query(sql, [userId, orgId || null, projectId || null, impersonatedUserId || null]);
      const row = res.rows?.[0];
      const ctx = row?.context as ContextDto | undefined;

      if (!ctx || !ctx.org || !ctx.org.id) {
        throw new ConflictException('Organization context could not be resolved');
      }

      return ctx;
    } catch (error) {
      this.logger.error('Failed to build context', error as any);
      throw error;
    }
  }
}
