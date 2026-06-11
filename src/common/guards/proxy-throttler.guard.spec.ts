import { ProxyThrottlerGuard } from './proxy-throttler.guard';
import { HttpException, HttpStatus } from '@nestjs/common';

// Мокаємо ThrottlerGuard щоб не потрібен весь NestJS DI
jest.mock('@nestjs/throttler', () => ({
  ThrottlerGuard: class {
    protected async getTracker(req: any) { return ''; }
    protected async throwThrottlingException(ctx: any, detail: any) {}
  },
}));

describe('ProxyThrottlerGuard', () => {
  let guard: ProxyThrottlerGuard;

  beforeEach(() => {
    guard = new ProxyThrottlerGuard({} as any, {} as any, {} as any);
  });

  // ==========================================
  // БЛОК: getTracker — формування ключа
  // ==========================================
  describe('getTracker()', () => {
    it('використовує x-real-ip як IP (від BFF)', async () => {
      const req = {
        headers: { 'x-real-ip': '1.2.3.4' },
        ip: '10.0.0.1',
        body: {},
      };

      const key = await (guard as any).getTracker(req);

      expect(key).toBe('1.2.3.4'); // x-real-ip має пріоритет
    });

    it('fallback на req.ip якщо немає x-real-ip', async () => {
      const req = {
        headers: {},
        ip: '10.0.0.1',
        body: {},
      };

      const key = await (guard as any).getTracker(req);

      expect(key).toBe('10.0.0.1');
    });

    it('fallback на 127.0.0.1 якщо немає ні заголовку ні ip', async () => {
      const req = {
        headers: {},
        ip: undefined,
        body: {},
      };

      const key = await (guard as any).getTracker(req);

      expect(key).toBe('127.0.0.1');
    });

    it('формує композитний ключ IP:email для auth endpoints', async () => {
      const req = {
        headers: { 'x-real-ip': '5.5.5.5' },
        ip: '10.0.0.1',
        body: { email: 'hacker@evil.com', password: 'brute' },
      };

      const key = await (guard as any).getTracker(req);

      // Захист від botnet: 10,000 проксі не переберуть один акаунт
      expect(key).toBe('5.5.5.5:hacker@evil.com');
    });

    it('формує композитний ключ IP:username якщо email відсутній', async () => {
      const req = {
        headers: { 'x-real-ip': '5.5.5.5' },
        ip: '10.0.0.1',
        body: { username: 'victim_user' },
      };

      const key = await (guard as any).getTracker(req);

      expect(key).toBe('5.5.5.5:victim_user');
    });

    it('email має пріоритет над username', async () => {
      const req = {
        headers: { 'x-real-ip': '5.5.5.5' },
        ip: '10.0.0.1',
        body: { email: 'user@test.com', username: 'someuser' },
      };

      const key = await (guard as any).getTracker(req);

      expect(key).toBe('5.5.5.5:user@test.com');
    });

    it('чистий IP для не-auth endpoints (без email/username в body)', async () => {
      const req = {
        headers: { 'x-real-ip': '9.9.9.9' },
        ip: '10.0.0.1',
        body: { title: 'My Card', content: 'some content' },
      };

      const key = await (guard as any).getTracker(req);

      expect(key).toBe('9.9.9.9');
    });
  });

  // ==========================================
  // БЛОК: throwThrottlingException
  // ==========================================
  describe('throwThrottlingException()', () => {
    it('кидає 429 з Retry-After інформацією', async () => {
      const throttlerDetail = { timeToExpire: 30000 }; // 30 секунд

      await expect(
        (guard as any).throwThrottlingException({}, throttlerDetail)
      ).rejects.toThrow(HttpException);
    });

    it('відповідь містить статус 429', async () => {
      const throttlerDetail = { timeToExpire: 15000 };

      try {
        await (guard as any).throwThrottlingException({}, throttlerDetail);
      } catch (err) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toContain('15 seconds');
      }
    });
  });
});