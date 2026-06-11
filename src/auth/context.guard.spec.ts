import { ContextGuard } from './context.guard';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

const mockContextBuilder = {
  build: jest.fn(),
};

const mockSupabaseService = {
  getAdminClient: jest.fn(),
};

function createMockContext(overrides: {
  userId?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
} = {}) {
  const req: any = {
    user: { userId: overrides.userId ?? 'user-123' },
    headers: overrides.headers ?? {},
    cookies: overrides.cookies ?? {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
    req,
  };
}

describe('ContextGuard', () => {
  let guard: ContextGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ContextGuard(
      mockSupabaseService as any,
      mockContextBuilder as any,
    );
  });

  it('кидає ForbiddenException якщо юзер не автентифікований', async () => {
    const ctx = createMockContext({ userId: undefined });
    ctx.req.user = null;

    await expect(guard.canActivate(ctx as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('кидає BadRequestException якщо не вдалося визначити org контекст', async () => {
    mockContextBuilder.build.mockResolvedValue({ org: null, actor: { userId: 'user-123' } });

    const ctx = createMockContext({ headers: { 'x-org-id': 'org-1' } });

    await expect(guard.canActivate(ctx as any))
      .rejects.toThrow(BadRequestException);
  });

  it('встановлює req.context при валідному org контексті', async () => {
    mockContextBuilder.build.mockResolvedValue({
      org: { id: 'org-1', name: 'My Org', color: '#fff' },
      actor: { userId: 'user-123', realUserId: 'user-123', isImpersonated: false },
      meta: { orgRole: 'owner' },
      permissions: ['read', 'write'],
    });

    const ctx = createMockContext({ headers: { 'x-org-id': 'org-1' } });

    const result = await guard.canActivate(ctx as any);

    expect(result).toBe(true);
    expect(ctx.req.context.org.id).toBe('org-1');
    expect(ctx.req.context.org.role).toBe('owner');
    expect(ctx.req.context.userId).toBe('user-123');
  });

  it('читає org з заголовку x-org-id (пріоритет над куки)', async () => {
    mockContextBuilder.build.mockResolvedValue({
      org: { id: 'org-from-header', name: 'Header Org', color: '#000' },
      actor: { userId: 'user-123', realUserId: 'user-123', isImpersonated: false },
      meta: { orgRole: 'member' },
      permissions: [],
    });

    const ctx = createMockContext({
      headers: { 'x-org-id': 'org-from-header' },
      cookies: { active_org_id: 'org-from-cookie' },
    });

    await guard.canActivate(ctx as any);

    // contextBuilder повинен отримати org з заголовку, не з куки
    expect(mockContextBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-from-header' })
    );
  });

  it('читає org з куки якщо немає заголовку', async () => {
    mockContextBuilder.build.mockResolvedValue({
      org: { id: 'org-from-cookie', name: 'Cookie Org', color: '#000' },
      actor: { userId: 'user-123', realUserId: 'user-123', isImpersonated: false },
      meta: { orgRole: 'member' },
      permissions: [],
    });

    const ctx = createMockContext({
      cookies: { active_org_id: 'org-from-cookie' },
    });

    await guard.canActivate(ctx as any);

    expect(mockContextBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-from-cookie' })
    );
  });
});