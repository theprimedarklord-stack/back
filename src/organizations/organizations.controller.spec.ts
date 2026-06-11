import { OrganizationsController } from './organizations.controller';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

// ---- Мок сервісу ----
const mockOrganizationsService = {
  findAllForUser: jest.fn(),
  findOne: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  canSwitchTo: jest.fn(),
  checkSlugAvailable: jest.fn(),
  getMembers: jest.fn(),
  addMember: jest.fn(),
  updateMemberRole: jest.fn(),
  removeMember: jest.fn(),
};

// ---- Хелпер: мок request ----
function createReq(overrides: {
  userId?: string;
  orgRole?: string;
  headers?: Record<string, string>;
  dbClient?: any;
} = {}) {
  return {
    user: { userId: overrides.userId ?? 'user-123' },
    context: {
      org: { id: 'org-1', role: overrides.orgRole ?? 'owner' },
    },
    headers: overrides.headers ?? { 'x-org-id': 'org-1' },
    dbClient: overrides.dbClient ?? { query: jest.fn() },
  };
}

// ---- Мок response (для cookie) ----
function createRes() {
  return { cookie: jest.fn() };
}

describe('OrganizationsController (NestJS)', () => {
  let controller: OrganizationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OrganizationsController(mockOrganizationsService as any);
  });

  // ==========================================
  // БЛОК: findAll — юзер бачить тільки свої орги
  // ==========================================
  describe('findAll()', () => {
    it('повертає організації поточного юзера', async () => {
      mockOrganizationsService.findAllForUser.mockResolvedValue([
        { id: 'org-1', name: 'My Org', role: 'owner' },
      ]);

      const req = createReq();
      const result = await controller.findAll(req as any);

      expect(result.organizations).toHaveLength(1);
      expect(mockOrganizationsService.findAllForUser).toHaveBeenCalledWith(
        'user-123',
        req.dbClient,
      );
    });
  });

  // ==========================================
  // БЛОК: switchOrganization — cross-tenant захист
  // ==========================================
  describe('switchOrganization()', () => {
    it('успішно перемикає орг якщо юзер є членом', async () => {
      mockOrganizationsService.canSwitchTo.mockResolvedValue(true);
      const req = createReq();
      const res = createRes();

      const result = await controller.switchOrganization(
        { organizationId: 'org-1' },
        req as any,
        res as any,
      );

      expect(result.success).toBe(true);
      expect(res.cookie).toHaveBeenCalledWith(
        'active_org_id',
        'org-1',
        expect.any(Object),
      );
    });

    it('повертає success:false якщо юзер НЕ є членом', async () => {
      mockOrganizationsService.canSwitchTo.mockResolvedValue(false);
      const req = createReq();
      const res = createRes();

      const result = await controller.switchOrganization(
        { organizationId: 'org-other' },
        req as any,
        res as any,
      );

      expect(result.success).toBe(false);
      // Cookie не повинна бути встановлена
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // БЛОК: getMembers — тільки члени орги
  // ==========================================
  describe('getMembers()', () => {
    it('повертає членів якщо поточний юзер є членом', async () => {
      mockOrganizationsService.canSwitchTo.mockResolvedValue(true);
      mockOrganizationsService.getMembers.mockResolvedValue([
        { user_id: 'user-123', role: 'owner' },
        { user_id: 'user-456', role: 'member' },
      ]);

      const req = createReq();
      const result = await controller.getMembers('org-1', req as any);

      expect(result.members).toHaveLength(2);
    });

    it('кидає ForbiddenException якщо юзер не є членом орги', async () => {
      mockOrganizationsService.canSwitchTo.mockResolvedValue(false);
      const req = createReq({ userId: 'stranger' });

      await expect(controller.getMembers('org-1', req as any))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================
  // БЛОК: removeMember — owner або сам юзер
  // ==========================================
  describe('removeMember()', () => {
    it('owner може видалити будь-якого члена', async () => {
      mockOrganizationsService.removeMember.mockResolvedValue(undefined);
      const req = createReq({ userId: 'owner-123', orgRole: 'owner' });

      await expect(
        controller.removeMember('org-1', 'member-456', req as any)
      ).resolves.not.toThrow();

      expect(mockOrganizationsService.removeMember).toHaveBeenCalledWith(
        'org-1', 'member-456', 'owner-123'
      );
    });

    it('юзер може видалити СЕБЕ (leave org)', async () => {
      mockOrganizationsService.removeMember.mockResolvedValue(undefined);
      const req = createReq({ userId: 'user-123', orgRole: 'member' });

      await expect(
        controller.removeMember('org-1', 'user-123', req as any) // memberId = свій userId
      ).resolves.not.toThrow();
    });

    it('member не може видалити ІНШОГО члена', async () => {
      const req = createReq({ userId: 'user-123', orgRole: 'member' });

      await expect(
        controller.removeMember('org-1', 'other-user-456', req as any)
      ).rejects.toThrow();

      expect(mockOrganizationsService.removeMember).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // БЛОК: findBySlug — валідація формату
  // ==========================================
  describe('findBySlug()', () => {
    it('кидає BadRequestException при невалідному slug', async () => {
      const req = createReq();

      await expect(
        controller.findBySlug('INVALID SLUG!!', req as any)
      ).rejects.toThrow(BadRequestException);
    });

    it('кидає BadRequestException якщо slug довший за 32 символи', async () => {
      const req = createReq();

      await expect(
        controller.findBySlug('a'.repeat(33), req as any)
      ).rejects.toThrow(BadRequestException);
    });

    it('повертає організацію при валідному slug', async () => {
      mockOrganizationsService.findBySlug.mockResolvedValue({
        id: 'org-1', name: 'My Org', slug: 'my-org',
      });
      const req = createReq();

      const result = await controller.findBySlug('my-org', req as any);

      expect(result.organization.slug).toBe('my-org');
    });
  });

  // ==========================================
  // БЛОК: checkSlug
  // ==========================================
  describe('checkSlug()', () => {
    it('повертає available:false для зарезервованого slug "admin"', async () => {
      const result = await controller.checkSlug('admin');
      expect(result.available).toBe(false);
    });

    it('повертає available:false для невалідного формату', async () => {
      const result = await controller.checkSlug('ab'); // менше 3 символів
      expect(result.available).toBe(false);
    });

    it('повертає available:true для вільного slug', async () => {
      mockOrganizationsService.checkSlugAvailable.mockResolvedValue(true);
      const result = await controller.checkSlug('my-unique-company');
      expect(result.available).toBe(true);
    });
  });

  // ==========================================
  // БЛОК: addMember — invite по email
  // ==========================================
  describe('addMember()', () => {
    it('успішно додає члена по email', async () => {
      mockOrganizationsService.addMember.mockResolvedValue({
        user_id: 'user-456',
        role: 'member',
      });

      const result = await controller.addMember('org-1', {
        email: 'newmember@example.com',
        role: 'member',
      });

      expect(result.member.role).toBe('member');
      expect(mockOrganizationsService.addMember).toHaveBeenCalledWith(
        'org-1',
        { email: 'newmember@example.com', role: 'member' },
      );
    });
  });
});