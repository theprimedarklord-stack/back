# ContextBuilderService — Contract and Behavior

## Overview
`ContextBuilderService.build(params)` returns the single active context for a request. The service uses a single Postgres CTE query to assemble: actor, org, project, permissions, limits, flags, meta/debug.

## Input
```ts
{
  userId: string,              // from JWT
  orgId?: string,              // optional header `x-org-id`
  projectId?: string,          // optional header `x-project-id`
  impersonatedUserId?: string  // optional header for impersonation
}
```

## Output (ContextDto)
```ts
{
  actor: { userId, realUserId, isImpersonated },
  org: { id, name },
  project: { id, name } | null,
  permissions: string[],
  limits: JSONB,
  flags: JSONB,
  meta: { orgRole, projectRole }
}
```

## Fallback logic for org selection
Priority order:
1. `orgId` header (only if user is a member)
2. `users.last_active_org_id` (if present)
3. first org where the user is a member

If no org can be resolved, `ContextBuilderService.build()` will throw `ConflictException` (HTTP 409) — callers should handle this by asking the user to select or create an organization.

## Impersonation
- If `impersonatedUserId` is provided and allowed, the actor returned is the impersonated user with `isImpersonated=true` and `realUserId` set to the original user.
- Impersonation permission checks should be done in the auth layer before calling `build()` (or extended in the query if desired).

## Permissions / Limits / Flags
- `permissions` is a flat array of permission codes aggregated from org and project roles.
- `limits` and `flags` are returned fully (JSONB) for the resolved org.

## RLS Integration
- The repository includes `db/migrations/20260129_add_rls_app_org.sql` which defines `get_app_org_id()` and RLS policies.
- Services should set the org context before executing RLS-protected queries using `DatabaseService.withOrgContext(orgId, cb)` or by issuing `SELECT set_config('app.org_id', orgId, true)` within a transaction.

## Examples
- `GET /me/context` — returns `ContextDto`.
- `GET /me/orgs` — returns list of orgs (useful for UI org switcher).
- `GET /me/projects?orgId=...` — lists projects in the selected org.

## Notes
- `orgRole` and `projectRole` are included in `meta` for debugging only; they are not intended for UI role logic.
- Keep caching at the API edge if needed; the SQL is optimized for single-call assembly.

