import { OrganizationsService } from './organizations.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockSupabaseQuery = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn(),
  maybeSingle: jest.fn(),
};

const mockSupabaseService = {
  getAdminClient: jest.fn().mockReturnValue(mockSupabaseQuery),
};

describe('OrganizationsService', () => {
  let service: OrganizationsService;

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

    service = new OrganizationsService(mockSupabaseService as any);
  });

  // ==========================================
  // БЛОК: findAllForUser — юзер бачить тільки свої орги
  // ==========================================
  describe('findAllForUser()', () => {
    it('повертає тільки організації СВОГО юзера', async () => {
      mockSupabaseQuery.eq.mockResolvedValue({
        data: [
          {
            role: 'owner',
            organization: {
              id: 'org-1',
              name: 'My Org',
              slug: 'my-org',
              color: '#fff',
              created_by_user_id: 'user-123',
              created_at: '2024-01-01',
            },
          },
        ],
        error: null,
      });

      const result = await service.findAllForUser('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('org-1');
      expect(result[0].role).toBe('owner');
      // Перевіряємо що запит фільтрував по user_id
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('user_id', 'user-123');
    });

    it('повертає порожній масив якщо юзер не в жодній орзі', async () => {
      mockSupabaseQuery.eq.mockResolvedValue({ data: [], error: null });

      const result = await service.findAllForUser('lonely-user');

      expect(result).toEqual([]);
    });

    it('кидає BadRequestException при помилці БД', async () => {
      mockSupabaseQuery.eq.mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      });

      await expect(service.findAllForUser('user-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // БЛОК: findOne — юзер не може зайти в чужу org
  // ==========================================
  describe('findOne()', () => {
    it('повертає організацію якщо юзер є членом', async () => {
      mockSupabaseQuery.single.mockResolvedValue({
        data: {
          role: 'admin',
          organization: {
            id: 'org-1',
            name: 'My Org',
            slug: 'my-org',
            color: '#fff',
            created_by_user_id: 'user-123',
            created_at: '2024-01-01',
          },
        },
        error: null,
      });

      const result = await service.findOne('org-1', 'user-123');

      expect(result.id).toBe('org-1');
      expect(result.role).toBe('admin');
    });

    it('кидає NotFoundException якщо юзер НЕ є членом організації', async () => {
      // Supabase повертає null — юзер не в цій орзі
      mockSupabaseQuery.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(service.findOne('org-999', 'user-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('кидає NotFoundException при спробі доступу до чужої організації', async () => {
      mockSupabaseQuery.single.mockResolvedValue({
        data: null,
        error: null, // data null = не є членом
      });

      await expect(service.findOne('org-other-company', 'user-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================
  // БЛОК: canSwitchTo — перевірка членства
  // ==========================================
  describe('canSwitchTo()', () => {
    it('повертає true якщо юзер є членом організації', async () => {
      mockSupabaseQuery.single.mockResolvedValue({
        data: { user_id: 'user-123' },
        error: null,
      });

      const result = await service.canSwitchTo('org-1', 'user-123');

      expect(result).toBe(true);
    });

    it('повертає false якщо юзер НЕ є членом організації', async () => {
      mockSupabaseQuery.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await service.canSwitchTo('org-1', 'stranger-user');

      expect(result).toBe(false);
    });
  });

  // ==========================================
  // БЛОК: checkSlugAvailable — зарезервовані слаги
  // ==========================================
  describe('checkSlugAvailable()', () => {
    it('повертає false для зарезервованого слагу "admin"', async () => {
      const result = await service.checkSlugAvailable('admin');
      expect(result).toBe(false);
    });

    it('повертає false для зарезервованого слагу "api"', async () => {
      const result = await service.checkSlugAvailable('api');
      expect(result).toBe(false);
    });

    it('повертає false якщо слаг вже зайнятий в БД', async () => {
      mockSupabaseQuery.single.mockResolvedValue({
        data: { id: 'org-existing' },
        error: null,
      });

      const result = await service.checkSlugAvailable('my-company');
      expect(result).toBe(false);
    });

    it('повертає true якщо слаг вільний', async () => {
      mockSupabaseQuery.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await service.checkSlugAvailable('my-unique-company');
      expect(result).toBe(true);
    });
  });

  // ==========================================
  // БЛОК: addMember — захист від дублів
  // ==========================================
  describe('addMember()', () => {
    it('кидає BadRequestException якщо юзер вже є членом', async () => {
      // Перший eq — пошук по email (якщо є)
      // Другий — перевірка existing member
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: { user_id: 'user-456' }, error: null }) // find by email
        .mockResolvedValueOnce({ data: { user_id: 'user-456' }, error: null }); // already member

      await expect(
        service.addMember('org-1', { email: 'existing@example.com', role: 'member' })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // БЛОК: removeMember — захист останнього owner
  // ==========================================
describe('removeMember()', () => {
  it('кидає BadRequestException при спробі видалити останнього owner', async () => {
    // Перший .eq повертає this, другий .eq повертає дані
    mockSupabaseQuery.eq
      .mockReturnValueOnce(mockSupabaseQuery)  // .eq('organization_id', orgId)
      .mockResolvedValueOnce({                 // .eq('role', 'owner')
        data: [{ user_id: 'owner-123' }],
        error: null,
      });

    await expect(
      service.removeMember('org-1', 'owner-123', 'owner-123')
    ).rejects.toThrow(BadRequestException);
  });
});
});