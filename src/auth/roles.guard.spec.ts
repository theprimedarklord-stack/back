import { RolesGuard } from './roles.guard';
import { ForbiddenException } from '@nestjs/common';

const mockReflector = { get: jest.fn() };

function createMockContext(orgRole?: string, projectRole?: string) {
  const req: any = {
    context: {
      org: orgRole ? { id: 'org-1', role: orgRole } : undefined,
      project: projectRole ? { id: 'proj-1', role: projectRole } : undefined,
    },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
  };
}

describe('RolesGuard (NestJS)', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(mockReflector as any);
  });

  it('пропускає якщо немає @Roles() декоратора', () => {
    mockReflector.get.mockReturnValue(undefined);
    const ctx = createMockContext('member');
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('пропускає owner якщо вимагається owner', () => {
    mockReflector.get.mockReturnValue(['owner']);
    const ctx = createMockContext('owner');
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('пропускає admin якщо вимагається owner або admin', () => {
    mockReflector.get.mockReturnValue(['owner', 'admin']);
    const ctx = createMockContext('admin');
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('кидає ForbiddenException якщо member намагається виконати owner дію', () => {
    mockReflector.get.mockReturnValue(['owner']);
    const ctx = createMockContext('member');
    expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
  });

  it('кидає ForbiddenException якщо немає ролі в контексті', () => {
    mockReflector.get.mockReturnValue(['owner']);
    const ctx = createMockContext(); // без ролі
    expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
  });

  it('project role має пріоритет над org role', () => {
    mockReflector.get.mockReturnValue(['project_owner']);
    const ctx = createMockContext('member', 'project_owner');
    expect(guard.canActivate(ctx as any)).toBe(true);
  });
});