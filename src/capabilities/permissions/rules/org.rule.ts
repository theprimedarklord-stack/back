/**
 * Organization rule — grants access if the user's orgId matches an allowed org.
 * Expects `ruleConfig.allowedOrgIds` (string[]) and `credentials.orgId`.
 */
export function checkOrgRule(
  ruleConfig: Record<string, any>,
  credentials: Record<string, any>,
): boolean {
  if (!credentials.orgId || !Array.isArray(ruleConfig.allowedOrgIds)) {
    return false;
  }
  return ruleConfig.allowedOrgIds.includes(credentials.orgId);
}
