import { OrgProjectsService } from './org-projects.service';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';

const mockSupabaseQuery = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  limit: jest.fn().mockReturnThis(),
};

const mockSupabaseService = {
  getAdminClient: jest.fn().mockReturnValue(mockSupabaseQuery),
};

describe('OrgProjectsService (NestJS)', () => {
  let service: OrgProjectsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseService.getAdminClient.mockReturnValue(mockSupabaseQuery);
    mockSupabaseQuery.from.mockReturnThis();
    mockSupabaseQuery.select.mockReturnThis();
    mockSupabaseQuery.insert.mockReturnThis();
    mockSupabaseQuery.update.mockReturnThis();
    mockSupabaseQuery.delete.mockReturnThis();
    mockSupabaseQuery.eq.mockReturnThis();
    mockSupabaseQuery.limit.mockReturnThis();

    service = new OrgProjectsService(mockSupabaseService as any);
  });

  // ==========================================
  // БЛОК: findOne — ізоляція проектів
  // ==========================================
  describe('findOne()', () => {
    it('повертає проект з роллю юзера', async () => {
      mockSupabaseQuery.single
        .mockResolvedValueOnce({
          data: { id: 'proj-1', organization_id: 'org-1', name: 'My Project', created_by_user_id: 'user-123', created_at: '2024-01-01' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { role: 'project_owner' },
          error: null,
        });

      const result = await service.findOne('proj-1', 'user-123');

      expect(result.id).toBe('proj-1');
      expect(result.role).toBe('project_owner');
    });

    it('кидає NotFoundException якщо проект не існує', async () => {
      mockSupabaseQuery.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      await expect(service.findOne('ghost-proj', 'user-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================
  // БЛОК: addMember — юзер має бути в орзі спочатку
  // ==========================================
  describe('addMember()', () => {
    it('кидає ForbiddenException якщо юзер не в організації', async () => {
      // find by email → знайшли userId
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: { user_id: 'user-456' }, error: null })
        // org membership check → не є членом
        .mockResolvedValueOnce({ data: null, error: null });

      await expect(
        service.addMember('proj-1', 'org-1', { email: 'stranger@example.com', role: 'project_member' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('кидає BadRequestException якщо юзер вже в проекті', async () => {
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: { user_id: 'user-456' }, error: null }) // find by email
        .mockResolvedValueOnce({ data: { user_id: 'user-456' }, error: null }) // org member ✓
        .mockResolvedValueOnce({ data: { user_id: 'user-456' }, error: null }); // already project member

      await expect(
        service.addMember('proj-1', 'org-1', { email: 'member@example.com', role: 'project_member' })
      ).rejects.toThrow(BadRequestException);
    });

    it('кидає NotFoundException якщо email не знайдений в системі', async () => {
      mockSupabaseQuery.single.mockResolvedValue({ data: null, error: null });

      await expect(
        service.addMember('proj-1', 'org-1', { email: 'nobody@example.com', role: 'project_member' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================
  // БЛОК: removeMember — захист останнього owner
  // ==========================================
  describe('removeMember()', () => {
    it('кидає BadRequestException при спробі видалити останнього project_owner', async () => {
      mockSupabaseQuery.eq
        .mockReturnValueOnce(mockSupabaseQuery)
        .mockResolvedValueOnce({
          data: [{ user_id: 'owner-123' }],
          error: null,
        });

      await expect(
        service.removeMember('proj-1', 'owner-123')
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // БЛОК: canSwitchTo — cross-tenant захист
  // ==========================================
  describe('canSwitchTo()', () => {
    it('повертає false якщо проект належить іншій організації', async () => {
      mockSupabaseQuery.single.mockResolvedValue({
        data: { organization_id: 'org-OTHER' }, // ← інша орга
        error: null,
      });

      const result = await service.canSwitchTo('proj-1', 'user-123', 'org-1');

      expect(result).toBe(false);
    });

    it('повертає false якщо юзер не є членом проекту', async () => {
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: { organization_id: 'org-1' }, error: null }) // project belongs to org ✓
        .mockResolvedValueOnce({ data: null, error: null }); // not a member

      const result = await service.canSwitchTo('proj-1', 'stranger', 'org-1');

      expect(result).toBe(false);
    });

    it('повертає true якщо юзер є членом і проект в правильній орзі', async () => {
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: { organization_id: 'org-1' }, error: null })
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null });

      const result = await service.canSwitchTo('proj-1', 'user-123', 'org-1');

      expect(result).toBe(true);
    });
  });

  // ==========================================
  // БЛОК: updateMemberRole — захист останнього owner
  // ==========================================
  describe('updateMemberRole()', () => {
    it('кидає BadRequestException при зміні ролі останнього project_owner', async () => {
      mockSupabaseQuery.eq
        .mockReturnValueOnce(mockSupabaseQuery)
        .mockResolvedValueOnce({
          data: [{ user_id: 'owner-123' }],
          error: null,
        });

      await expect(
        service.updateMemberRole('proj-1', 'owner-123', { role: 'project_member' })
      ).rejects.toThrow(BadRequestException);
    });
  });
});