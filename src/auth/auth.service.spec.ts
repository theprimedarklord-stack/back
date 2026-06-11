import { AuthService } from './auth.service';
import { BadRequestException, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';

// ---- Мокаємо AWS SDK (не хочемо реальних запитів до Cognito) ----
const mockCognitoSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockCognitoSend,
  })),
  SignUpCommand: jest.fn(),
  InitiateAuthCommand: jest.fn(),
  ConfirmSignUpCommand: jest.fn(),
}));

// ---- Мокаємо Supabase ----
const mockSupabaseQuery = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
};

const mockSupabaseService = {
  getAdminClient: jest.fn().mockReturnValue(mockSupabaseQuery),
};

// ---- Хелпер: скидає всі моки перед кожним тестом ----
function resetMocks() {
  jest.clearAllMocks();
  mockSupabaseService.getAdminClient.mockReturnValue(mockSupabaseQuery);
  mockSupabaseQuery.from.mockReturnThis();
  mockSupabaseQuery.select.mockReturnThis();
  mockSupabaseQuery.eq.mockReturnThis();
  mockSupabaseQuery.insert.mockReturnThis();
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    resetMocks();
    service = new AuthService(mockSupabaseService as any);
    // Встановлюємо env змінні для тестів
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
    process.env.COGNITO_CLIENT_SECRET = 'test-client-secret';
    process.env.COGNITO_REGION = 'eu-central-1';
  });

  // ==========================================
  // БЛОК: LOGIN
  // ==========================================
  describe('login()', () => {
    it('повертає токени при правильних credentials', async () => {
      // Cognito повертає токени
      mockCognitoSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'access-token-123',
          IdToken: 'id-token-123',
          RefreshToken: 'refresh-token-123',
          ExpiresIn: 3600,
        },
      });
      // БД повертає дані юзера
      mockSupabaseQuery.single.mockResolvedValue({
        data: { theme: 'dark', role: 'user', username: 'testuser', user_id: 'uuid-123' },
        error: null,
      });

      const result = await service.login('test@example.com', 'Password123!');

      expect(result.accessToken).toBe('access-token-123');
      expect(result.refreshToken).toBe('refresh-token-123');
      expect(result.theme).toBe('dark');
    });

    it('кидає UnauthorizedException при неправильному паролі', async () => {
      mockCognitoSend.mockRejectedValue({ name: 'NotAuthorizedException' });

      await expect(service.login('test@example.com', 'wrongpass'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('кидає UnauthorizedException якщо юзер не існує', async () => {
      mockCognitoSend.mockRejectedValue({ name: 'UserNotFoundException' });

      await expect(service.login('nouser@example.com', 'pass'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('кидає BadRequestException якщо email не підтверджений', async () => {
      mockCognitoSend.mockRejectedValue({ name: 'UserNotConfirmedException' });

      await expect(service.login('unconfirmed@example.com', 'pass'))
        .rejects.toThrow(BadRequestException);
    });

    it('кидає InternalServerErrorException при невідомій помилці Cognito', async () => {
      mockCognitoSend.mockRejectedValue({ 
        name: 'ServiceUnavailableException', 
        message: 'Cognito is down' 
      });

      await expect(service.login('test@example.com', 'pass'))
        .rejects.toThrow(InternalServerErrorException);
    });
  });

  // ==========================================
  // БЛОК: РЕЄСТРАЦІЯ
  // ==========================================
  describe('register()', () => {
    it('успішна реєстрація нового юзера', async () => {
      // Email і username не зайняті в БД
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: null, error: null }) // email check
        .mockResolvedValueOnce({ data: null, error: null }); // username check

      // Cognito повертає sub
      mockCognitoSend.mockResolvedValue({
        UserSub: 'cognito-sub-123',
        UserConfirmed: false,
      });

      // Insert юзера і settings успішно
      mockSupabaseQuery.insert.mockResolvedValue({ error: null });

      const result = await service.register(
        'new@example.com',
        'Password123!',
        'newuser',
      );

      expect(result.success).toBe(true);
      expect(result.userConfirmed).toBe(false);
      expect(result.message).toBe('Требуется подтверждение email');
    });

    it('кидає BadRequestException якщо email вже зайнятий', async () => {
      // БД каже: email вже є
      mockSupabaseQuery.single.mockResolvedValueOnce({
        data: { email: 'existing@example.com' },
        error: null,
      });

      await expect(
        service.register('existing@example.com', 'Password123!', 'user')
      ).rejects.toThrow(BadRequestException);

      // Cognito не повинен бути викликаний взагалі
      expect(mockCognitoSend).not.toHaveBeenCalled();
    });

    it('кидає BadRequestException якщо username вже зайнятий', async () => {
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: null, error: null })           // email вільний
        .mockResolvedValueOnce({ data: { username: 'taken' }, error: null }); // username зайнятий

      await expect(
        service.register('new@example.com', 'Password123!', 'taken')
      ).rejects.toThrow(BadRequestException);

      expect(mockCognitoSend).not.toHaveBeenCalled();
    });

    it('кидає BadRequestException якщо пароль слабкий', async () => {
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockCognitoSend.mockRejectedValue({ name: 'InvalidPasswordException' });

      await expect(
        service.register('new@example.com', '123', 'user')
      ).rejects.toThrow(BadRequestException);
    });

    it('кидає BadRequestException якщо email вже в Cognito', async () => {
      mockSupabaseQuery.single
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockCognitoSend.mockRejectedValue({ name: 'UsernameExistsException' });

      await expect(
        service.register('duplicate@example.com', 'Password123!', 'user')
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // БЛОК: ПІДТВЕРДЖЕННЯ EMAIL
  // ==========================================
  describe('confirmSignUp()', () => {
    it('успішно підтверджує email', async () => {
      mockCognitoSend.mockResolvedValue({});

      const result = await service.confirmSignUp('test@example.com', '123456');

      expect(result.success).toBe(true);
    });

    it('кидає BadRequestException при неправильному коді', async () => {
      mockCognitoSend.mockRejectedValue({ name: 'CodeMismatchException' });

      await expect(service.confirmSignUp('test@example.com', 'wrongcode'))
        .rejects.toThrow(BadRequestException);
    });

    it('кидає BadRequestException якщо код прострочений', async () => {
      mockCognitoSend.mockRejectedValue({ name: 'ExpiredCodeException' });

      await expect(service.confirmSignUp('test@example.com', 'oldcode'))
        .rejects.toThrow(BadRequestException);
    });
  });
});