/**
 * Email rule — grants access if the user's email is in the allowed list.
 * Expects `ruleConfig.allowedEmails` (string[]) and `credentials.email`.
 */
export function checkEmailRule(
  ruleConfig: Record<string, any>,
  credentials: Record<string, any>,
): boolean {
  if (!credentials.email || !Array.isArray(ruleConfig.allowedEmails)) {
    return false;
  }
  const normalizedEmail = credentials.email.toLowerCase().trim();
  return ruleConfig.allowedEmails
    .map((e: string) => e.toLowerCase().trim())
    .includes(normalizedEmail);
}
