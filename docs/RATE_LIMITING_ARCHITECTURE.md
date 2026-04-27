# Rate Limiting Architecture (FAANG Hybrid Throttler)

**Статус:** ✅ Production-ready  
**Дата:** 2026-04-27  
**Пакет:** `@nestjs/throttler ^6.x` + `@nest-lab/throttler-storage-redis ^1.2`

---

## Архитектура

```
Request
  │
  ▼
[ProxyThrottlerGuard]          src/common/guards/proxy-throttler.guard.ts
  │  Ключ: "1.2.3.4:user@mail.com" (auth) или "1.2.3.4" (generic)
  │  IP берётся только из x-real-ip (Anti-Spoofing контракт с BFF)
  │
  ▼
[ThrottlerStorageRedisService] @nest-lab/throttler-storage-redis
  │  Использует глобальный THROTTLE_REDIS_CLIENT
  │
  ▼
[Redis]                        REDIS_URL из .env
  │  Ключи: "throttle:<ip>" или "throttle:<ip>:<email>"
  │  keyPrefix='throttle:' устанавливается в ThrottleRedisModule
```

---

## Модули и файлы

| Файл | Роль |
|------|------|
| `src/common/redis/throttle-redis.module.ts` | `@Global()` инфраструктурный модуль — создаёт Redis-клиент |
| `src/common/guards/proxy-throttler.guard.ts` | Гибридный ключ IP:email, Retry-After заголовок |
| `src/app.module.ts` | Импортирует `ThrottleRedisModule` один раз, настраивает `ThrottlerModule` |

---

## Env-переменные

```env
REDIS_URL=rediss://...          # Redis соединение (единственный источник)
THROTTLE_TTL_SECONDS=60         # Окно в СЕКУНДАХ (не мс!)
THROTTLE_LIMIT=100              # Лимит запросов в окне
```

> **⚠️ Важно:** `THROTTLE_TTL_SECONDS` — секунды. В `app.module.ts` используется
> хелпер `seconds()` из `@nestjs/throttler`, который конвертирует в мс.
> Ошибка "передать мс вместо с" = 16-часовой бан пользователей.

---

## Boot Order (явная защита)

`ThrottleRedisModule` имеет явный `imports: [ConfigModule]` в декораторе `@Module`.
Это защищает от runtime-ошибки при изменении порядка импортов в `AppModule`.

NestJS **не создаёт второй инстанс** `ConfigModule` — он дедуплицирует глобальные модули.

```typescript
// Порядок в AppModule.imports — критичен для читаемости, не для работы:
ConfigModule.forRoot({ isGlobal: true }),  // 1. Сначала
ThrottleRedisModule,                        // 2. Redis-клиент
ThrottlerModule.forRootAsync({ ... }),     // 3. Throttler использует клиент
```

---

## Redis Key Prefix

Текущая конфигурация — `keyPrefix: 'throttle:'` на уровне ioredis-драйвера.

**Аудит на staging:**
```bash
redis-cli -u $REDIS_URL KEYS "*"
```

Ожидаемый результат:
- `throttle:1.2.3.4` — generic endpoint
- `throttle:1.2.3.4:user@mail.com` — auth endpoint

Если пакет `@nest-lab/throttler-storage-redis` добавляет свой префикс, ключи будут:
- `throttle:throttler:1.2.3.4:…` — **допустимо**, но нужно выбрать один источник.

**Выбор:**
- Если пакет добавляет prefex → убрать `keyPrefix` из ioredis, оставить пакетный
- Если нет → текущее состояние идеально

---

## Unit-тесты: mock-хелпер

`ThrottleRedisModule` предоставляет статический хелпер `.mock()`:

```typescript
import { ThrottleRedisModule } from '../common/redis/throttle-redis.module';

const module = await Test.createTestingModule({
  imports: [ThrottleRedisModule.mock()],
}).compile();
```

Хелпер создаёт in-memory mock всех Redis методов без реального TCP-соединения.

---

## Graceful Shutdown

`ThrottleRedisModule` реализует `OnApplicationShutdown`.  
При получении SIGTERM/SIGINT — отправляется команда `QUIT` (ожидает завершения текущих команд, в отличие от `disconnect()`).

---

## Trade-offs

| | |
|---|---|
| `@Global()` | Упрощает DI, усложняет тесты → решено через `.mock()` |
| `enableOfflineQueue: false` | Fail-fast при падении Redis, без OOM |
| `maxRetriesPerRequest: 0` | Мгновенный отказ вместо накопления задержки |
| `seconds()` хелпер | Fail-fast компиляции при даунгрейде до @nestjs/throttler v4 |
