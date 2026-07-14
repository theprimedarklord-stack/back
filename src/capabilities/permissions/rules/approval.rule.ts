/**
 * Approval rule — grants access only if the user has an approved access request.
 * Expects `credentials.userId` and `credentials.approvedUserIds` (string[]).
 *
 * Note: The controller pre-fetches approved user IDs from `node_access_requests`
 * and injects them into the credentials before calling this rule checker.
 */
export function checkApprovalRule(
  _ruleConfig: Record<string, any>,
  credentials: Record<string, any>,
): boolean {
  if (!credentials.userId || !Array.isArray(credentials.approvedUserIds)) {
    return false;
  }
  return credentials.approvedUserIds.includes(credentials.userId);
}
