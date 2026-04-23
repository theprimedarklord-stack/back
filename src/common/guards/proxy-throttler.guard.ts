// src/common/guards/proxy-throttler.guard.ts
//
// FAANG-grade Hybrid Throttling Guard (Defense against Botnets).
//
// Контракт «Чистого IP»:
//   BFF (Next.js) выполняет Anti-Spoofing и прокидывает единственный
//   канонический заголовок `x-real-ip`. NestJS не парсит цепочки сам.
//
// Key strategy (Hybrid Botnet Shield):
//   Auth endpoints (email/username in body) → "1.2.3.4:user@mail.com"
//     Ботнет из 10,000 прокси не перебирает пароль к одному аккаунту.
//   Generic endpoints (no target in body)   → "1.2.3.4"
//     Стандартный IP-лимит.

import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ProxyThrottlerGuard extends ThrottlerGuard {
  /**
   * Returns a unique composite tracking key for the current request.
   *
   * 1. IP — берём из канонического заголовка x-real-ip (установлен BFF).
   *    Fallback на req.ip — для локальной разработки без BFF.
   * 2. targetIdentifier — email или username из тела запроса (auth-эндпоинты).
   *    Для обычных GET/POST это пустая строка → чистый IP-ключ.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // 1. Чистый IP от BFF (Anti-Spoofing уже выполнен на стороне BFF)
    const ip: string =
      (req.headers['x-real-ip'] as string | undefined) ||
      req.ip ||
      '127.0.0.1';

    // 2. Идентификатор цели — защита от распределённых атак на аккаунт
    const targetIdentifier: string =
      (req.body?.email as string | undefined) ||
      (req.body?.username as string | undefined) ||
      '';

    // 3. Составной ключ: "1.2.3.4:user@mail.com" или "1.2.3.4"
    return targetIdentifier ? `${ip}:${targetIdentifier}` : ip;
  }

  /**
   * Custom error with Retry-After information (FAANG standard).
   * Uses timeToExpire from ThrottlerRecord to tell the client
   * exactly how long to wait before retrying.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: any, // Typings not exported in @nestjs/throttler >= 6.x
  ): Promise<void> {
    const retrySeconds = Math.ceil(throttlerLimitDetail.timeToExpire / 1000);

    throw new HttpException(
      `Too Many Requests. Try again in ${retrySeconds} seconds.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
