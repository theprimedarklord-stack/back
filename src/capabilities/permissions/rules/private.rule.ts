/**
 * Private rule — access is granted only if the requesting user is the node owner.
 * Expects `credentials.userId` and `ruleConfig.ownerId` to be set.
 */
export function checkPrivateRule(
  ruleConfig: Record<string, any>,
  credentials: Record<string, any>,
): boolean {
  if (!credentials.userId || !ruleConfig.ownerId) {
    return false;
  }
  return credentials.userId === ruleConfig.ownerId;
}
