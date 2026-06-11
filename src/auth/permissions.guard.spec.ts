import { PermissionsGuard } from './permissions.guard';
import { ForbiddenException } from '@nestjs/common';

const mockReflector = { get: jest.fn() };
const mockPermissionsService = {
  hasOrganizationPermission: jest.fn(),
  hasProjectPermission: jest.fn(),
};

function createMockContext(overrides: {
  orgRole?: string;
  projectRole?: string;
} = {}) {
  const req: any = {
    context: {
      org: overrides.orgRole ? { id: 'org-1', role: overrides.orgRole } : undefined,
      project: overrides.projectRole ? { id: 'proj-1', role: overrides.projectRole } : undefined,
    },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
  };
}

describe('PermissionsGuard (NestJS)', () => {
  let guard: PermissionsGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionsGuard(
      mockReflector as any,
      mockPermissionsService as any,
    );
  });

  it('пропускає якщо немає @Permission() декоратора', async () => {
    mockReflector.get.mockReturnValue(undefined);
    const ctx = createMockContext({ orgRole: 'member' });
    const result = await guard.canActivate(ctx as any);
    expect(result).toBe(true);
  });

  it('owner з permissions.invite → пропускає', async () => {
    mockReflector.get.mockReturnValue({ action: 'members.invite', type: 'organization' });
    mockPermissionsService.hasOrganizationPermission.mockReturnValue(true);
    const ctx = createMockContext({ orgRole: 'owner' });
    const result = await guard.canActivate(ctx as any);
    expect(result).toBe(true);
  });

  it('member без members.invite → ForbiddenException', async () => {
    mockReflector.get.mockReturnValue({ action: 'members.invite', type: 'organization' });
    mockPermissionsService.hasOrganizationPermission.mockReturnValue(false);
    const ctx = createMockContext({ orgRole: 'member' });
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });

  it('кидає ForbiddenException якщо немає org контексту', async () => {
    mockReflector.get.mockReturnValue({ action: 'members.invite', type: 'organization' });
    const ctx = createMockContext(); // без org
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });

  it('project permission: project_owner → пропускає', async () => {
    mockReflector.get.mockReturnValue({ action: 'content.edit', type: 'project' });
    mockPermissionsService.hasProjectPermission.mockReturnValue(true);
    const ctx = createMockContext({ projectRole: 'project_owner' });
    const result = await guard.canActivate(ctx as any);
    expect(result).toBe(true);
  });

  it('project permission: viewer без content.edit → ForbiddenException', async () => {
    mockReflector.get.mockReturnValue({ action: 'content.edit', type: 'project' });
    mockPermissionsService.hasProjectPermission.mockReturnValue(false);
    const ctx = createMockContext({ projectRole: 'viewer' });
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });
});