import { OrgContext } from '../src/auth/context.guard';
import { ProjectContext } from '../src/auth/project.guard';

// Unified user payload that works with both legacy JWT and Cognito auth
interface AuthenticatedUser {
  // User ID in database (uuid)
  userId: string;
  // Alias for backward compatibility with legacy code using req.user.id
  id: string;
  // Email address
  email: string;
  // Cognito sub (only present for Cognito auth)
  sub?: string;
  // User role (legacy)
  role?: string;
  // Additional claims (only present for Cognito auth)
  claims?: Record<string, unknown>;
}

// Request context for organization/project scoping
interface RequestContext {
  org: OrgContext;
  project?: ProjectContext;
  userId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    // Authenticated user (set by JwtAuthGuard or CognitoAuthGuard)
    user?: AuthenticatedUser | null;
    // Organization/Project context (set by ContextGuard/ProjectGuard)
    context?: RequestContext;
  }
}
