/**
 * Public rule — grants access to everyone without any verification.
 */
export function checkPublicRule(
  _ruleConfig: Record<string, any>,
  _credentials: Record<string, any>,
): boolean {
  return true;
}
