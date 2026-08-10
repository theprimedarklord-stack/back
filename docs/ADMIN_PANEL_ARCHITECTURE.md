# Админ-панель `/adminys` — архитектура и правила работы

Документ для агентов и разработчиков, которые правят или расширяют админку.
Затрагивает **оба репозитория**:

- Фронт: `SmartMemory--NextJS`
- Бэк: `smartmemory-backend`

---

## 1. Цепочка данных

```
UsersPanel.jsx
  └─ fetch('/api/bff/admin/users')
       └─ BFF catch-all:  src/app/api/bff/[...path]/route.ts
            │  срезает префикс /api/bff  →  путь становится /admin/users
            │  требует cookie x-active-account
            │  достаёт сессию из session Redis по cookie sm_session_{accountId}
            │  вешает Authorization: Bearer <access_token>, x-user-id,
            │         x-service-token (M2M), x-org-id, x-real-ip
            │  при 401 от Nest — reactive refresh через Cognito и один retry
            └─ NestJS: AdminController @Controller('admin') @Get('users')
                 ├─ CognitoAuthGuard      → req.user.id
                 ├─ checkAdminRole()      → Supabase, роль == 'admin'
                 ├─ Supabase SELECT users (вкл. last_seen_at)
                 └─ Session Redis MGET cache:presence:{userId}
                      → мержит is_online в каждого юзера
```

Ответ: `{ success: true, users: [...] }`.

> `success: false` возвращается со статусом **HTTP 200** и полем `status` внутри тела.
> Фронт обязан проверять `data.success`, а не только `response.ok`.

---

## 2. Ловушка №1: два контроллера с `@Get('users')`

В бэкенде **два** эндпоинта, отдающих список пользователей:

| Эндпоинт | Файл | Presence | Назначение |
|---|---|---|---|
| `GET /admin/users` | `src/admin/admin.controller.ts` | **есть** | актуальный, используется админкой |
| `GET /auth/users` | `src/auth/auth.controller.ts` | нет | legacy, оставлен как есть |

`/auth/users` отдаёт только `user_id, email, username, role` — без `last_seen_at`
и без `is_online`. Если админка ходит туда, панель показывает **«Online: Never»
и «0 online»** независимо от того, работает Redis или нет.

**Правило:** всё, что связано с админкой, идёт в `AdminController`.
Не добавляй админские эндпоинты в `AuthController`.

Различить, куда реально ушёл запрос, проще всего по языку сообщения об ошибке:

- `AdminController` — русский: `Доступ запрещен: требуется роль администратора`
- `AuthController` — украинский: `Доступ заборонено: потрібна роль адміністратора`

---

## 3. Ловушка №2: `getClient()` против `getAdminClient()`

`src/supabase/supabase.service.ts` отдаёт два разных клиента:

| Метод | Ключ | RLS |
|---|---|---|
| `getClient()` | `SUPABASE_ANON_KEY` | **действует** |
| `getAdminClient()` | `SUPABASE_SERVICE_ROLE_KEY` | обходит |

Anon-клиент создаётся **без пользовательского JWT** — Nest не пробрасывает в него
токен из запроса. Под RLS такой клиент по таблице `users` не видит ничего, и любой
`.select(...).single()` возвращает ошибку.

Практический эффект: `checkAdminRole()` на `getClient()` всегда возвращает `false`,
и эндпоинт отвечает 403 даже настоящему админу.

**Правило для админских эндпоинтов: только `getAdminClient()`.**

Это безопасно, потому что доступ уже ограничен двумя слоями:

1. `@UseGuards(CognitoAuthGuard)` — `req.user.id` берётся из проверенного токена
2. `checkAdminRole(req.user.id)` — явная проверка роли в БД

Никогда не бери идентификатор пользователя из тела запроса или заголовка для
проверки прав — только `req.user.id`.

### Текущее состояние `admin.controller.ts`

Переведены на `getAdminClient()` (рабочие):

- `checkAdminRole()`
- `@Get('users')` — выборка пользователей

Ещё на `getClient()` (**сломаны RLS, требуют такого же фикса**):

`@Get('stats')`, `@Patch('users/:userId/role')`, `@Delete('users/:userId')`,
`@Get('users/:userId')`, смена статуса, чтение `admin_logs`, `logAdminAction()`.

Эти эндпоинты сейчас проходят гард, но тихо падают на уровне БД.
Чинятся тем же способом. **Учти при фиксе удаления юзера:** оно сейчас не работает
из-за RLS, и после перевода на `getAdminClient()` станет по-настоящему рабочим —
включая удаление из AWS Cognito.

---

## 4. Redis: три отдельных инстанса

Это **разные серверы Aiven**, а не разные базы одного сервера. Перепутать их легко.

| Назначение | Переменная | Кто пишет | Кто читает |
|---|---|---|---|
| Сессии + presence | `REDIS_URL` (NextJS)<br>`SESSION_REDIS_URL` (Nest) | BFF | BFF, Nest (read-only) |
| Троттлинг | `REDIS_URL` (Nest) | Nest | Nest |
| WebSocket | `WS_REDIS_URL` (Nest) | Nest | Nest |

**`SESSION_REDIS_URL` в бэкенде обязан совпадать с `REDIS_URL` фронта.**
Это тот самый инстанс, куда BFF пишет presence-ключи. Если подставить сюда
throttle-Redis, ключи не найдутся и `is_online` будет `false` у всех.

### Подводные камни окружения

- `ConfigModule.forRoot({ isGlobal: true })` без `envFilePath` читает **только `.env`**.
  Файл `.env.local` в бэкенде Nest **не подхватывает**.
- На хостинге (Render/AWS) переменную нужно завести вручную — локальный `.env`
  туда не едет.
- Если `SESSION_REDIS_URL` не задана, `SessionRedisModule` не падает: он логирует
  warning и отдаёт отключённый dummy-клиент. Приложение работает, но presence
  молча выключен у всех. **Ищи в логах строку `[SessionRedisModule]`.**

### `SESSION_REDIS_CLIENT` — read-only по договорённости

`src/common/redis/session-redis.module.ts` регистрирует токен `SESSION_REDIS_CLIENT`.
Клиент создан **без `keyPrefix`**, потому что BFF пишет полные ключи.

Не пиши через него высокочастотные данные — session Redis должен оставаться
свободным от eviction-нагрузки.

---

## 5. Механика presence

### Ключи

| Ключ | TTL | Кто пишет |
|---|---|---|
| `cache:presence:{userId}` | 90 с | BFF heartbeat, каждый удар |
| `cache:presence:db_sync:{userId}` | 300 с | BFF heartbeat, как дебаунс записи в БД |

> **Осторожно:** `cache:presence:db_sync:` — это подпрефикс `cache:presence:`.
> Любой `SCAN`/`KEYS` по маске `cache:presence:*` захватит и db_sync-ключи.
> Поэтому чтение сделано через `MGET` с явным списком id, а не по маске.
> Если будешь добавлять обход по маске — фильтруй db_sync явно.

### Клиент

`src/hooks/useHeartbeat.ts`, подключён через `(protected)/HeartbeatProvider.jsx`
в `(protected)/layout.js`. Работает только на защищённых страницах.

Поведение намеренно ленивое:

- первый удар не на маунте, а через `requestIdleCallback` + 5 с (таймаут ожидания 10 с)
- дальше интервал 60 с ± 10 с джиттера
- при скрытии вкладки интервал **останавливается**, при возврате — немедленный удар
- ошибки глушатся молча, ретраев нет — следующий интервал разберётся

Отсюда следствие: пользователь уходит в offline примерно через 90 с после
переключения вкладки. Это by design, а не баг.

Джиттер вычисляется **один раз** при создании интервала. Максимум 70 с при TTL 90 с —
запас 20 с. Если будешь менять `BASE_INTERVAL_MS` или `JITTER_MS`, следи, чтобы
`BASE + JITTER` оставалось заметно меньше `PRESENCE_TTL`.

### Сервер

`src/app/api/bff/heartbeat/route.ts`:

1. `resolveUserId()` — из cookie `x-active-account`, затем `sm_session_{accountId}`,
   затем сессия из Redis → `sub_id`
2. `SET cache:presence:{userId} EX 90`
3. если `cache:presence:db_sync:{userId}` отсутствует — ставит его на 300 с и
   фоном обновляет `users.last_seen_at` в Supabase

**Слабое место при отладке:** `resolveUserId()` возвращает `null` без единого лога —
и клиент получает 401, а ключ не пишется. Если presence не работает, а Redis
доступен, временно добавь лог именно сюда.

---

## 6. Как проверить, что presence живой

Скрипт-проба (read-only, `SCAN` а не `KEYS`):

```js
const Redis = require('ioredis');
const url = process.env.PROBE_REDIS_URL;
const client = new Redis(url, {
  tls: url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: 1,
});

(async () => {
  let cursor = '0';
  const found = [];
  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', 'cache:presence:*', 'COUNT', 200);
    cursor = next;
    found.push(...keys);
  } while (cursor !== '0');

  if (!found.length) console.log('NO presence keys at all');
  for (const k of found) console.log(k, 'TTL=' + (await client.ttl(k)));
  await client.quit();
})();
```

Запуск (ioredis берётся из node_modules фронта):

```bash
export PROBE_REDIS_URL="<значение REDIS_URL фронта>"
export NODE_PATH="/путь/к/SmartMemory--NextJS/node_modules"
node probe.js
```

**Как читать результат.** Пустой вывод сам по себе ничего не доказывает: если ни одна
вкладка приложения не открыта, ключи законно протухли по TTL. Корректная проверка:

1. открыть фронт, залогиниться, зайти на любую страницу под `(protected)`
2. подождать ~15 с (ленивый старт heartbeat)
3. запустить пробу — должен появиться `cache:presence:{твой user_id}` с TTL ≤ 90

---

## 7. Чеклист для нового админского эндпоинта

1. Метод кладём в `AdminController` (`@Controller('admin')`), не в `AuthController`.
2. Вешаем `@UseGuards(CognitoAuthGuard)`.
3. Первой строкой — `checkAdminRole(req.user.id)`, при `false` отдаём `FORBIDDEN`.
4. Все обращения к Supabase — через **`getAdminClient()`**.
5. Идентификатор действующего пользователя берём только из `req.user.id`.
6. Возвращаем `{ success: true, ... }` / `{ success: false, error, status }`.
7. На фронте фетчим `/api/bff/admin/...` — catch-all прокси доставит на `/admin/...`.
   Отдельный route-файл в `src/app/api/bff/` создавать не нужно.
8. На фронте проверяем `data.success`, а не только `response.ok`.
9. Деструктивные операции — логируем через `logAdminAction()`.

## 8. Чеклист отладки «данные не приходят»

По порядку, от дешёвого к дорогому:

1. В Network смотрим, **какой URL** реально дёргается. Путаница
   `/auth/users` ↔ `/admin/users` — исторически самая частая причина.
2. Смотрим текст ошибки — по языку определяем контроллер (см. раздел 2).
3. 403 у настоящего админа → почти наверняка `getClient()` вместо
   `getAdminClient()` (раздел 3).
4. 401 от BFF → нет cookie `x-active-account` либо сессия истекла в Redis.
5. Данные пришли, но `is_online` у всех `false` → проверяем `SESSION_REDIS_URL`
   на сервере и ищем `[SessionRedisModule]` в логах Nest.
6. Только потом лезем в heartbeat (раздел 5).

> После правок в бэкенде **нужен рестарт NestJS**. На Render автодеплой
> не всегда срабатывает — проверяй, что задеплоился нужный коммит.
