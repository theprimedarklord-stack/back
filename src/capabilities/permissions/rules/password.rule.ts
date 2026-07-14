import * as crypto from 'crypto';

/**
 * Password rule — verifies that the supplied password matches the stored hash.
 * Expects `ruleConfig.passwordHash` (SHA-256 hex) and `credentials.password`.
 */
export function checkPasswordRule(
  ruleConfig: Record<string, any>,
  credentials: Record<string, any>,
): boolean {
  if (!credentials.password || !ruleConfig.passwordHash) {
    return false;
  }
  const hash = crypto
    .createHash('sha256')
    .update(credentials.password)
    .digest('hex');
  return hash === ruleConfig.passwordHash;
}
