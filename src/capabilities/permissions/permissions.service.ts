import { Injectable } from '@nestjs/common';

const ACCESS_HIERARCHY = ['view', 'comment', 'edit', 'execute', 'admin'];

@Injectable()
export class PermissionsService {
  /**
   * Checks if the granted access level is sufficient for the required access level.
   * Both arguments must be one of: 'view', 'comment', 'edit', 'execute', 'admin'.
   */
  hasSufficientAccess(granted: string, required: string): boolean {
    const grantedIndex = ACCESS_HIERARCHY.indexOf(granted);
    const requiredIndex = ACCESS_HIERARCHY.indexOf(required);
    
    if (grantedIndex === -1 || requiredIndex === -1) {
      return false;
    }
    
    return grantedIndex >= requiredIndex;
  }
}
