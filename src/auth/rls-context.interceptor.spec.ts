import { RlsContextInterceptor } from './rls-context.interceptor';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

// ---- МОКИ (підробки залежностей) ----

// Підробна БД
const mockDb = {
  withUserContext: jest.fn(),
};

// Підробний Reflector (читає декоратори)
const mockReflector = {
  getAllAndOverride: jest.fn(),
};

// ---- ХЕЛПЕР: створює підробний HTTP контекст ----
// (бо ExecutionContext це складний об'єкт NestJS)
function createMockContext(overrides: {
  userId?: string;
  orgId?: string;
  path?: string;
  method?: string;
}) {
  const req = {
    user: overrides.userId ? { userId: overrides.userId } : undefined,
    headers: {
      'x-org-id': overrides.orgId,
    },
    path: overrides.path ?? '/cards',
    method: overrides.method ?? 'GET',
  };

  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

// Підробний next.handle() — імітує що контролер відповів успішно
const mockNext = {
  handle: jest.fn().mockReturnValue({
    pipe: jest.fn(),
    subscribe: jest.fn(),
  }),
};

// ---- САМІ ТЕСТИ ----

describe('RlsContextInterceptor', () => {
  let interceptor: RlsContextInterceptor;

  beforeEach(() => {
    // Перед кожним тестом — чистий стан
    jest.clearAllMocks();
    interceptor = new RlsContextInterceptor(
      mockDb as any,
      mockReflector as any,
    );
    // За замовчуванням: @RequireOrg не вказано (тобто org required)
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
  });

  // ТЕСТ 1
  it('кидає BadRequestException якщо немає x-org-id', async () => {
    const ctx = createMockContext({ userId: 'user-123', orgId: undefined });

    await expect(
      interceptor.intercept(ctx, mockNext as any)
    ).rejects.toThrow(BadRequestException);
  });

  // ТЕСТ 2
  it('кидає ForbiddenException якщо юзер не в організації', async () => {
    // БД каже: юзер НЕ є членом організації
    mockDb.withUserContext.mockImplementation(async (userId, fn) => {
      const fakeClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }), // порожній результат
      };
      return fn(fakeClient);
    });

    const ctx = createMockContext({
      userId: 'user-123',
      orgId: 'org-456',
    });

    await expect(
      interceptor.intercept(ctx, mockNext as any)
    ).rejects.toThrow(ForbiddenException);
  });

  // ТЕСТ 3
  it('пропускає перевірку org якщо @RequireOrg(false)', async () => {
    // Імітуємо що на контролері стоїть @RequireOrg(false)
    mockReflector.getAllAndOverride.mockReturnValue(false);

    // БД повертає результат без помилки
    mockDb.withUserContext.mockImplementation(async (userId, fn, opts) => {
      const fakeClient = { query: jest.fn() };
      return fn(fakeClient);
    });

    const ctx = createMockContext({
      userId: 'user-123',
      orgId: undefined, // немає org — але не повинен падати
    });

    // Не повинно кидати помилку
    await expect(
      interceptor.intercept(ctx, mockNext as any)
    ).resolves.not.toThrow();
  });

  // ТЕСТ 4
  it('пропускає RLS для публічних шляхів (/health)', async () => {
    const ctx = createMockContext({
      path: '/health',
      userId: undefined,
    });

    // next.handle() повинен бути викликаний без перевірок
    const result = await interceptor.intercept(ctx, mockNext as any);
    expect(result).toBeDefined();
    expect(mockDb.withUserContext).not.toHaveBeenCalled();
  });
});