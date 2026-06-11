import { UserService } from './user.service';
import { BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';

// ---- Мок Supabase (для аватарки) ----
const mockStorageFrom = {
  createSignedUploadUrl: jest.fn(),
  getPublicUrl: jest.fn(),
};

const mockSupabaseService = {
  getAdminClient: jest.fn().mockReturnValue({
    storage: {
      from: jest.fn().mockReturnValue(mockStorageFrom),
    },
  }),
};

// ---- Мок DB клієнта (RLS транзакційний) ----
function createMockDbClient(queryResult: any = { rows: [] }) {
  return { query: jest.fn().mockResolvedValue(queryResult) };
}

describe('UserService (NestJS)', () => {
  let service: UserService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserService(mockSupabaseService as any);
  });

  // ==========================================
  // БЛОК: getMe
  // ==========================================
  describe('getMe()', () => {
    it('повертає дані юзера', async () => {
      const dbClient = createMockDbClient({
        rows: [{
          user_id: 'user-123',
          full_name: 'John Doe',
          avatar_url: 'https://example.com/avatar.jpg',
          email: 'john@example.com',
          username: 'johndoe',
          last_active_org_id: 'org-1',
        }],
      });

      const result = await service.getMe(dbClient, 'user-123');

      expect(result.user_id).toBe('user-123');
      expect(result.full_name).toBe('John Doe');
      expect(result.name).toBe('John Doe'); // prefer full_name
      expect(result.active_org_id).toBe('org-1');
    });

    it('fallback на username якщо full_name порожній', async () => {
      const dbClient = createMockDbClient({
        rows: [{
          user_id: 'user-123',
          full_name: null,
          username: 'johndoe',
          email: 'john@example.com',
          avatar_url: null,
          last_active_org_id: null,
        }],
      });

      const result = await service.getMe(dbClient, 'user-123');

      expect(result.name).toBe('johndoe');
    });

    it('кидає NotFoundException якщо юзер не знайдений', async () => {
      const dbClient = createMockDbClient({ rows: [] });

      await expect(service.getMe(dbClient, 'ghost-user'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================
  // БЛОК: updateMe
  // ==========================================
  describe('updateMe()', () => {
    it('оновлює username і full_name', async () => {
      const dbClient = createMockDbClient({
        rows: [{
          user_id: 'user-123',
          username: 'newname',
          full_name: 'New Name',
          avatar_url: null,
          email: 'john@example.com',
        }],
      });

      const result = await service.updateMe(dbClient, {
        username: 'newname',
        full_name: 'New Name',
      });

      expect(result.username).toBe('newname');
      expect(result.full_name).toBe('New Name');
      expect(dbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE public.users'),
        expect.any(Array),
      );
    });

    it('кидає BadRequestException якщо не передано жодного поля', async () => {
      const dbClient = createMockDbClient({ rows: [] });

      await expect(service.updateMe(dbClient, {}))
        .rejects.toThrow(BadRequestException);
    });

    it('кидає NotFoundException якщо RLS заблокував оновлення', async () => {
      const dbClient = createMockDbClient({ rows: [] }); // 0 rows = RLS block

      await expect(service.updateMe(dbClient, { username: 'hacker' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================
  // БЛОК: updateSettings — whitelist захист
  // ==========================================
  describe('updateSettings()', () => {
    it('зберігає валідні налаштування', async () => {
      const dbClient = createMockDbClient({
        rows: [{ theme: 'dark', language: 'uk' }],
      });

      const result = await service.updateSettings(dbClient, {
        theme: 'dark',
        language: 'uk',
      });

      expect(dbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.user_settings'),
        expect.arrayContaining(['dark', 'uk']),
      );
    });

    it('ігнорує поля поза whitelist (SQL injection захист)', async () => {
      const dbClient = createMockDbClient({ rows: [{}] });

      // Передаємо невалідне поле — воно має бути відфільтроване
      await service.updateSettings(dbClient, {
        theme: 'dark',
        // @ts-ignore — навмисно передаємо заборонене поле
        malicious_field: 'DROP TABLE users',
      });

      const query = dbClient.query.mock.calls[0]?.[0] || '';
      expect(query).not.toContain('malicious_field');
      expect(query).not.toContain('DROP TABLE');
    });

    it('повертає success якщо не передано жодного валідного поля', async () => {
      const dbClient = createMockDbClient({ rows: [] });

      const result = await service.updateSettings(dbClient, {
        // @ts-ignore
        unknown_field: 'value',
      });

      expect(result.success).toBe(true);
      expect(dbClient.query).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // БЛОК: generateAvatarUploadUrl
  // ==========================================
  describe('generateAvatarUploadUrl()', () => {
    it('повертає signedUrl і path', async () => {
      mockStorageFrom.createSignedUploadUrl.mockResolvedValue({
        data: { signedUrl: 'https://storage.example.com/upload?token=abc' },
        error: null,
      });

      const result = await service.generateAvatarUploadUrl('user-123', 'photo.jpg');

      expect(result.signedUrl).toBe('https://storage.example.com/upload?token=abc');
      expect(result.path).toContain('user-123/');
      expect(result.path).toContain('.jpg');
    });

    it('кидає InternalServerErrorException при помилці storage', async () => {
      mockStorageFrom.createSignedUploadUrl.mockResolvedValue({
        data: null,
        error: { message: 'Storage error' },
      });

      await expect(
        service.generateAvatarUploadUrl('user-123', 'photo.jpg')
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ==========================================
  // БЛОК: getSettings
  // ==========================================
  describe('getSettings()', () => {
    it('повертає налаштування юзера', async () => {
      const dbClient = createMockDbClient({
        rows: [{ theme: 'dark', language: 'en', sidebar_mode: 'expanded' }],
      });

      const result = await service.getSettings(dbClient);

      expect(result.theme).toBe('dark');
      expect(result.language).toBe('en');
    });

    it('повертає null якщо налаштувань немає', async () => {
      const dbClient = createMockDbClient({ rows: [] });

      const result = await service.getSettings(dbClient);

      expect(result).toBeNull();
    });
  });
});