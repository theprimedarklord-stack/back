import { CognitoAuthGuard } from './cognito-auth.guard';
import { UnauthorizedException } from '@nestjs/common';

// ---- Мокаємо jose (бібліотека JWT) ----
const mockJwtVerify = jest.fn();
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn().mockReturnValue('mock-jwks'),
  jwtVerify: (...args: any[]) => mockJwtVerify(...args),
}));

// ---- Моки залежностей ----
const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      COGNITO_REGION: 'eu-central-1',
      COGNITO_USER_POOL_ID: 'eu-central-1_testpool',
      COGNITO_CLIENT_ID: 'test-client-id',
    };
    return config[key];
  }),
};

const mockSupabaseQuery = {
  from: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  single: jest.fn(),
};

const mockSupabaseService = {
  getAdminClient: jest.fn().mockReturnValue(mockSupabaseQuery),
};

const mockReflector = {
  getAllAndOverride: jest.fn().mockReturnValue(false), // @Public() = false за замовчуванням
};

// ---- Хелпер: підробний HTTP контекст ----
function createMockContext(token?: string) {
  const req = {
    headers: {
      authorization: token ? `Bearer ${token}` : undefined,
    },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
    req,
  };
}

describe('CognitoAuthGuard', () => {
  let guard: CognitoAuthGuard;

  beforeEach(() => {
    jest.resetAllMocks();
  
    // ← Додай це — відновлюємо config після reset
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        COGNITO_REGION: 'eu-central-1',
        COGNITO_USER_POOL_ID: 'eu-central-1_testpool',
        COGNITO_CLIENT_ID: 'test-client-id',
      };
      return config[key];
    });
  
    mockReflector.getAllAndOverride.mockReturnValue(false);
    mockSupabaseService.getAdminClient.mockReturnValue(mockSupabaseQuery);
    mockSupabaseQuery.from.mockReturnThis();
    mockSupabaseQuery.upsert.mockReturnThis();
    mockSupabaseQuery.select.mockReturnThis();
  
    guard = new CognitoAuthGuard(
      mockConfigService as any,
      mockSupabaseService as any,
      mockReflector as any,
    );
  });

  // ==========================================
  // БЛОК: @Public() маршрути
  // ==========================================
  describe('@Public() маршрути', () => {
    it('пропускає запит без токену якщо маршрут @Public()', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(true); // @Public() = true
      const ctx = createMockContext(); // без токену

      const result = await guard.canActivate(ctx as any);
      expect(result).toBe(true);
    });
  });

  // ==========================================
  // БЛОК: Витягування токену
  // ==========================================
  describe('Витягування токену', () => {
    it('кидає UnauthorizedException якщо немає Authorization заголовку', async () => {
      const ctx = createMockContext(); // без токену

      await expect(guard.canActivate(ctx as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('кидає UnauthorizedException якщо тип не Bearer', async () => {
      const ctx = createMockContext();
      (ctx.req as any).headers.authorization = 'Basic sometoken';

      await expect(guard.canActivate(ctx as any))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ==========================================
  // БЛОК: Валідація JWT
  // ==========================================
  describe('Валідація JWT токену', () => {
    it('кидає UnauthorizedException при невалідному токені', async () => {
      mockJwtVerify.mockRejectedValue(new Error('JWSSignatureVerificationFailed'));
      const ctx = createMockContext('invalid.token.here');

      await expect(guard.canActivate(ctx as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('кидає UnauthorizedException при прострочений токен', async () => {
      const err = new Error('JWTExpired');
      err.name = 'JWTExpired';
      mockJwtVerify.mockRejectedValue(err);

      const ctx = createMockContext('expired.token.here');

      await expect(guard.canActivate(ctx as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('кидає UnauthorizedException якщо client_id не співпадає', async () => {
      // Токен валідний, але client_id чужий
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: 'cognito-sub-123',
          client_id: 'WRONG-client-id', // ← не наш
          token_use: 'access',
          email: 'test@example.com',
        },
      });

      const ctx = createMockContext('valid.token.here');

      await expect(guard.canActivate(ctx as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('кидає UnauthorizedException якщо token_use не access', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: 'cognito-sub-123',
          client_id: 'test-client-id',
          token_use: 'id', // ← id токен замість access
          email: 'test@example.com',
        },
      });

      const ctx = createMockContext('id.token.here');

      await expect(guard.canActivate(ctx as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('кидає UnauthorizedException якщо sub відсутній', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: null, // ← немає sub
          client_id: 'test-client-id',
          token_use: 'access',
        },
      });

      const ctx = createMockContext('no-sub.token.here');

      await expect(guard.canActivate(ctx as any))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ==========================================
  // БЛОК: Успішна авторизація + LRU кеш
  // ==========================================
  describe('Успішна авторизація', () => {
    const validPayload = {
      payload: {
        sub: 'cognito-sub-123',
        client_id: 'test-client-id',
        token_use: 'access',
        email: 'test@example.com',
      },
    };

    beforeEach(() => {
      mockJwtVerify.mockResolvedValue(validPayload);
      // Supabase повертає userId при upsert
      mockSupabaseQuery.single.mockResolvedValue({
        data: { user_id: 'db-uuid-123' },
        error: null,
      });
    });

    it('повертає true і встановлює req.user при валідному токені', async () => {
      const ctx = createMockContext('valid.token.here');

      const result = await guard.canActivate(ctx as any);

      expect(result).toBe(true);
      expect((ctx.req as any).user.userId).toBe('db-uuid-123');
      expect((ctx.req as any).user.sub).toBe('cognito-sub-123');
      expect((ctx.req as any).user.email).toBe('test@example.com');
    });

    it('другий запит того самого юзера НЕ йде в БД (LRU кеш)', async () => {
      const ctx1 = createMockContext('valid.token.here');
      const ctx2 = createMockContext('valid.token.here');
    
      await guard.canActivate(ctx1 as any); // cache MISS → іде в БД
    
      // Запам'ятовуємо скільки разів зверталися до БД після першого запиту
      const dbCallsAfterFirst = mockSupabaseService.getAdminClient.mock.calls.length;
    
      await guard.canActivate(ctx2 as any); // cache HIT → не повинен йти в БД
    
      // Після другого запиту кількість звернень до БД НЕ повинна вирости
      expect(mockSupabaseService.getAdminClient.mock.calls.length).toBe(dbCallsAfterFirst);
    });
  });
});