# SmartMemory Backend - Project Documentation

## 📋 Общая информация
- **Название**: SmartMemory Backend
- **Тип**: REST API для системы интервального повторения (SRS - Spaced Repetition System)
- **Фреймворк**: NestJS 11.0.1
- **Node версия**: >= 22.0.0
- **Package Manager**: npm >= 10.0.0
- **TypeScript**: 5.7.3

## 🏗️ Архитектура

### Технологический стек
- **Backend Framework**: NestJS 11.0.1 (Node.js + Express)
- **Язык**: TypeScript 5.7.3
- **База данных**: Supabase (PostgreSQL)
- **Аутентификация**: JWT + httpOnly Cookies
- **ORM/Клиент**: @supabase/supabase-js 2.49.4
- **Валидация**: class-validator 0.14.1, class-transformer 0.5.1
- **WebSocket**: @nestjs/websockets, @nestjs/platform-socket.io 11.1.0
- **Cache**: ioredis 5.6.1 (Redis)
- **File Upload**: multer (через @nestjs/platform-express)
- **Cookie Parser**: cookie-parser 1.4.7
- **JWT**: jsonwebtoken 9.0.2

### Дополнительные инструменты
- **Testing**: Jest 29.7.0, Supertest 7.0.0
- **Linting**: ESLint 9.18.0, Prettier 3.4.2
- **Build**: @nestjs/cli 11.0.0, SWC (компилятор)
- **Dev Tools**: ts-node, nodemon (через nest start --watch)

## 📁 Структура проекта

### Основные директории
```
src/
├── auth/                      # Модуль аутентификации
│   ├── auth.controller.ts     # Контроллер (login, register, logout, profile)
│   ├── auth.service.ts        # Бизнес-логика аутентификации
│   ├── auth.dto.ts            # DTO (LoginDto, RegisterDto)
│   ├── auth.module.ts         # NestJS модуль
│   └── jwt-auth.guard.ts      # Guard для защиты роутов
├── cards/                     # Модуль карточек (SRS)
│   ├── cards.controller.ts    # CRUD карточек, история, reviews
│   ├── cards.service.ts       # Бизнес-логика карточек
│   └── cards.module.ts        # NestJS модуль
├── goals/                     # Модуль целей
│   ├── goals.controller.ts    # CRUD целей и подцелей
│   ├── goals.service.ts       # Бизнес-логика целей
│   ├── goals.module.ts        # NestJS модуль
│   ├── dto/                   # Data Transfer Objects
│   │   ├── create-goal.dto.ts
│   │   ├── update-goal.dto.ts
│   │   ├── add-subgoal.dto.ts
│   │   └── patch-subgoal.dto.ts
│   └── entities/              # Entities
│       └── goal.entity.ts
├── tasks/                     # Модуль задач
│   ├── tasks.controller.ts    # CRUD задач
│   ├── tasks.service.ts       # Бизнес-логика задач
│   ├── tasks.module.ts        # NestJS модуль
│   ├── dto/                   # Data Transfer Objects
│   │   ├── create-task.dto.ts
│   │   └── update-task.dto.ts
│   └── entities/
│       └── task.entity.ts
├── user/                      # Модуль пользователя
│   ├── user.controller.ts     # Профиль, настройки, аватар, тема
│   └── user.module.ts         # NestJS модуль
├── admin/                     # Модуль администратора
│   ├── admin.controller.ts    # Управление пользователями, статистика
│   ├── admin.service.ts       # Бизнес-логика админки
│   └── admin.module.ts        # NestJS модуль
├── dictionary/                # Модуль словаря
│   ├── dictionary.controller.ts
│   ├── dictionary.service.ts
│   └── dictionary.module.ts
├── supabase/                  # Supabase клиент
│   ├── supabase.service.ts    # Сервис для работы с Supabase
│   └── supabase.module.ts     # NestJS модуль
├── common/                    # Общие компоненты
│   ├── filters/
│   │   └── http-exception.filter.ts  # Глобальный фильтр ошибок
│   └── middleware/
│       └── auth.middleware.ts        # Middleware аутентификации
├── test/                      # Тестовые данные
│   └── levels.json
├── app.module.ts              # Главный модуль приложения
├── app.controller.ts          # Корневой контроллер
├── app.service.ts             # Корневой сервис
└── main.ts                    # Точка входа приложения

middleware/                    # Внешний middleware (за пределами src/)
└── auth.middleware.ts

Корневые файлы:
├── package.json               # Зависимости и скрипты
├── tsconfig.json              # Конфигурация TypeScript
├── nest-cli.json              # Конфигурация NestJS CLI
├── eslint.config.mjs          # Конфигурация ESLint
├── render.yaml                # Конфигурация Render deployment
├── railway.json               # Конфигурация Railway deployment
└── database_migration_add_status_history.sql  # SQL миграция
```

## 🔑 Ключевые особенности

### 1. **Cookie-Based Authentication**
Все JWT токены хранятся в httpOnly cookies для безопасности:
```typescript
// src/auth/auth.controller.ts
res.cookie('access_token', result.access_token, {
  httpOnly: true,
  secure: isProd, // true в production
  sameSite: isProd ? 'none' : 'lax', // 'none' для cross-domain
  maxAge: maxAge * 1000,
  path: '/',
});
```

### 2. **JWT Guard Protection**
Защита маршрутов через декоратор `@UseGuards(JwtAuthGuard)`:
```typescript
// src/auth/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const token = this.extractTokenFromRequest(request);
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    request.user = payload;
    return true;
  }
}
```

### 3. **Global Validation Pipe**
Автоматическая валидация всех входящих данных:
```typescript
// src/main.ts
app.useGlobalPipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }),
);
```

### 4. **Supabase Integration**
Двойной клиент Supabase (regular + admin):
```typescript
// src/supabase/supabase.service.ts
export class SupabaseService {
  private supabase: SupabaseClient;        // Regular client
  private adminSupabase: SupabaseClient;   // Admin client (bypass RLS)

  getClient() { return this.supabase; }
  getAdminClient() { return this.adminSupabase; }
}
```

### 5. **Role-Based Access Control**
Проверка роли пользователя (admin, user):
```typescript
// src/admin/admin.controller.ts
private async checkAdminRole(userId: string) {
  const { data: userData } = await this.supabaseService
    .getClient()
    .from('users')
    .select('role')
    .eq('user_id', userId)
    .single();

  return userData?.role === 'admin';
}
```

### 6. **File Upload (Avatar)**
Загрузка файлов через multer + Supabase Storage:
```typescript
// src/user/user.controller.ts
@Post('avatar')
@UseGuards(JwtAuthGuard)
@UseInterceptors(FileInterceptor('avatar', multerConfig))
async uploadAvatar(@UploadedFile() file: Express.Multer.File) {
  // Upload to Supabase Storage bucket 'card-images'
  const { data } = await adminClient.storage
    .from('card-images')
    .upload(filePath, file.buffer);
}
```

### 7. **Global Exception Filter**
Централизованная обработка всех ошибок:
```typescript
// src/common/filters/http-exception.filter.ts
app.useGlobalFilters(new AllExceptionsFilter());
```

### 8. **CORS для Cross-Domain**
Настройка CORS для работы с фронтендом на другом домене:
```typescript
// src/main.ts
const clientUrl = process.env.NODE_ENV === 'production'
  ? 'https://smartmemory.vercel.app'
  : 'http://localhost:3000';

app.enableCors({
  origin: clientUrl,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', ...],
  exposedHeaders: ['Set-Cookie'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});
```

### 9. **Trust Proxy для Cookies**
Критично для работы secure cookies за прокси (Render/Railway):
```typescript
// src/main.ts
app.getHttpAdapter().getInstance().set('trust proxy', 1);
```

### 10. **Увеличенный лимит Body**
Для загрузки больших файлов (50MB):
```typescript
// src/main.ts
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

## 📡 API Endpoints

### Authentication (`/auth`)
| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| POST | `/auth/login` | - | Вход в систему (email, password, rememberMe) |
| POST | `/auth/register` | - | Регистрация (email, password, username) |
| POST | `/auth/logout` | - | Выход из системы (очистка cookies) |
| GET | `/auth/profile` | ✓ | Получение профиля пользователя + настройки |
| PATCH | `/auth/profile` | ✓ | Обновление настроек пользователя |
| GET | `/auth/users` | ✓ | Получение списка всех пользователей (admin) |
| GET | `/auth/user_list` | ✓ | Получение списка пользователей для выбора |

**Примеры запросов:**
```typescript
// POST /auth/login
{
  "email": "user@example.com",
  "password": "Password123!",
  "rememberMe": true
}

// Response
{
  "success": true,
  "theme": "light",
  "user_id": "uuid-here"
}
// + Set-Cookie: access_token=jwt-token; HttpOnly; Secure; SameSite=None
```

### Cards (`/cards`)
| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| GET | `/cards` | ✓ | Получение всех карточек пользователя |
| POST | `/cards` | ✓ | Создание новой карточки |
| GET | `/cards/:id` | ✓ | Получение карточки по ID |
| PATCH | `/cards/:id` | ✓ | Обновление карточки |
| DELETE | `/cards/:id` | ✓ | Удаление карточки |
| GET | `/cards/card-history?zoneId=1&hours=24` | ✓ | История карточек по зоне |
| POST | `/cards/card-reviews` | ✓ | Создание review карточки |

**Примеры запросов:**
```typescript
// POST /cards
{
  "name": "Заголовок карточки",
  "description": "Описание с поддержкой **Markdown** и $\\LaTeX$",
  "card_class": "default",
  "zone": 1,
  "folder_id": null
}

// GET /cards/card-history?zoneId=1&hours=24
// Response: массив reviews за последние 24 часа из зоны 1
```

### Goals (`/goals`)
| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| GET | `/goals` | ✓ | Получение всех целей пользователя |
| POST | `/goals` | ✓ | Создание новой цели |
| GET | `/goals/:id` | ✓ | Получение цели по ID |
| PATCH | `/goals/:id` | ✓ | Обновление цели |
| DELETE | `/goals/:id` | ✓ | Удаление цели |
| GET | `/goals/:goalId/subgoals` | ✓ | Получение подцелей |
| POST | `/goals/:goalId/subgoals` | ✓ | Добавление подцели |
| PATCH | `/goals/:goalId/subgoals/:subgoalId` | ✓ | Обновление подцели |
| DELETE | `/goals/:goalId/subgoals/:subgoalId` | ✓ | Удаление подцели |
| GET | `/goals/categories/list` | - | Получение списка категорий |
| GET | `/goals/priorities/list` | - | Получение списка приоритетов |

**Примеры запросов:**
```typescript
// POST /goals
{
  "title": "Выучить TypeScript",
  "description": "Полное изучение TypeScript для работы",
  "keywords": ["typescript", "programming"],
  "category": "learning",
  "priority": "high",
  "deadline": "2025-12-31T23:59:59.999Z",
  "subgoals": [
    { "text": "Основы TypeScript", "completed": false },
    { "text": "Generics и Advanced Types", "completed": false }
  ]
}

// Response
{
  "success": true,
  "goal": {
    "id": 123,
    "title": "Выучить TypeScript",
    "goal_subgoals": [...]
  }
}
```

**Категории целей:**
- `technical` - Технические
- `organizational` - Организационные
- `personal` - Личные
- `learning` - Обучение
- `business` - Бизнес

**Приоритеты:**
- `low` - Низкий
- `medium` - Средний
- `high` - Высокий
- `critical` - Критический

### Tasks (`/tasks`)
| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| GET | `/tasks` | ✓ | Получение всех задач пользователя |
| GET | `/tasks?overdue=true` | ✓ | Получение просроченных задач |
| GET | `/tasks?priority=high` | ✓ | Фильтр по приоритету |
| POST | `/tasks` | ✓ | Создание новой задачи |
| GET | `/tasks/:id` | ✓ | Получение задачи по ID |
| PATCH | `/tasks/:id` | ✓ | Обновление задачи |
| DELETE | `/tasks/:id` | ✓ | Удаление задачи |
| GET | `/tasks/statuses/list` | - | Получение списка статусов |
| GET | `/tasks/priorities/list` | - | Получение списка приоритетов |

**Примеры запросов:**
```typescript
// POST /tasks
{
  "topic": "Реализовать API endpoint",
  "description": "Создать endpoint для получения статистики",
  "status": "not_completed",
  "priority": "high",
  "deadline": "2025-11-01T12:00:00.000Z",
  "goal_id": 123,
  "subgoal_id": 456,
  "status_history": [
    {
      "status": "not_completed",
      "timestamp": "2025-10-10T10:00:00.000Z",
      "action": "created"
    }
  ]
}
```

**Статусы задач:**
- `not_completed` - Не выполнено
- `completed` - Выполнено
- `not_needed` - Не нужно
- `half_completed` - Выполнено наполовину
- `urgent` - Срочно

### User (`/user`)
| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| GET | `/user/profile` | ✓ | Получение профиля (username, full_name) |
| POST | `/user/profile` | ✓ | Обновление профиля |
| POST | `/user/email` | ✓ | Изменение email |
| GET | `/user/avatar` | ✓ | Получение URL аватара |
| POST | `/user/avatar` | ✓ | Загрузка аватара (multipart/form-data) |
| DELETE | `/user/avatar` | ✓ | Удаление аватара |
| GET | `/user/theme` | ✓ | Получение темы пользователя |
| POST | `/user/theme` | ✓ | Изменение темы (light/dark) |
| GET | `/user/language` | ✓ | Получение языка пользователя |
| POST | `/user/language` | ✓ | Изменение языка (en/uk/ru) |
| GET | `/user/sidebar` | ✓ | Получение настроек sidebar |
| POST | `/user/sidebar` | ✓ | Изменение настроек sidebar |

**Примеры запросов:**
```typescript
// POST /user/avatar (multipart/form-data)
FormData: { avatar: File }

// POST /user/theme
{ "theme": "dark" }

// POST /user/language
{ "language": "uk" }

// POST /user/sidebar
{
  "sidebar_pinned": true,
  "sidebar_width": 300
}
```

### Admin (`/admin`)
| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| GET | `/admin/stats` | ✓ (Admin) | Статистика пользователей |
| GET | `/admin/users` | ✓ (Admin) | Список всех пользователей |
| GET | `/admin/users/:userId` | ✓ (Admin) | Информация о пользователе |
| PATCH | `/admin/users/:userId/role` | ✓ (Admin) | Изменение роли пользователя |
| PATCH | `/admin/users/:userId/status` | ✓ (Admin) | Блокировка/разблокировка |
| DELETE | `/admin/users/:userId` | ✓ (Admin) | Удаление пользователя |
| GET | `/admin/logs` | ✓ (Admin) | Получение логов админки |

**Примеры запросов:**
```typescript
// PATCH /admin/users/:userId/role
{ "role": "admin" } // или "user"

// PATCH /admin/users/:userId/status
{ "is_blocked": true } // или false
```

### Dictionary (`/dictionary`)
| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| GET | `/dictionary` | - | Получение словаря |
| POST | `/dictionary/save` | - | Сохранение словаря |

## 🔒 Аутентификация и авторизация

### Flow аутентификации
```
1. POST /auth/login (email, password)
   ↓
2. AuthService.login() → Supabase Auth
   ↓
3. Generate JWT token (payload: id, email, role)
   ↓
4. Set httpOnly cookie: access_token
   ↓
5. Return: { success: true, theme, user_id }

6. Дальнейшие запросы:
   Request с cookie → JwtAuthGuard → jwt.verify() → req.user = payload
```

### Защита маршрутов
```typescript
// В контроллере
@Controller('cards')
@UseGuards(JwtAuthGuard)  // Все маршруты контроллера защищены
export class CardsController {
  
  @Get()
  async getCards(@Req() req) {
    const userId = req.user.id;  // Доступен после Guard
    // ...
  }
}
```

### Cookie Settings
```typescript
// Development
{
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
  maxAge: 3600000 // 1 час (или 30 дней если rememberMe=true)
}

// Production
{
  httpOnly: true,
  secure: true,           // HTTPS only
  sameSite: 'none',       // Cross-domain
  maxAge: 2592000000      // 30 дней
}
```

### JWT Payload
```typescript
interface UserPayload {
  id: string;        // Supabase user UUID
  email: string;     // User email
  role?: string;     // 'admin' | 'user'
}
```

## ✅ Валидация и DTO

### ValidationPipe Configuration
```typescript
// src/main.ts
new ValidationPipe({
  transform: true,                // Автоматическое преобразование типов
  whitelist: true,                // Удалять неописанные поля
  forbidNonWhitelisted: true,     // Ошибка при неописанных полях
  transformOptions: { 
    enableImplicitConversion: true  // Неявное преобразование типов
  },
})
```

### Примеры DTO

**LoginDto:**
```typescript
// src/auth/auth.dto.ts
export class LoginDto {
  @IsEmail({}, { message: 'Некорректный формат email' })
  email: string;

  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password: string;

  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
```

**RegisterDto:**
```typescript
export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/, {
    message: 'Пароль должен содержать заглавные и строчные буквы, цифры и спецсимволы',
  })
  password: string;

  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Имя пользователя может содержать только буквы, цифры, _ и -',
  })
  username: string;
}
```

**CreateGoalDto:**
```typescript
// src/goals/dto/create-goal.dto.ts
export class CreateGoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsIn(['technical', 'organizational', 'personal', 'learning', 'business'])
  category?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubgoalDto)
  subgoals?: CreateSubgoalDto[];
}
```

**CreateTaskDto:**
```typescript
// src/tasks/dto/create-task.dto.ts
export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  topic: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsIn(['not_completed', 'completed', 'not_needed', 'half_completed', 'urgent'])
  status?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatusHistoryEntryDto)
  status_history?: StatusHistoryEntryDto[];

  @IsOptional()
  @IsNumber()
  goal_id?: number | null;

  @IsOptional()
  @IsNumber()
  subgoal_id?: number | null;
}
```

## 🗄️ База данных (Supabase PostgreSQL)

### Основные таблицы

**users**
```sql
- user_id: UUID (PK, ссылка на auth.users)
- email: TEXT
- username: TEXT (UNIQUE)
- full_name: TEXT
- avatar_url: TEXT
- theme: TEXT ('light' | 'dark')
- role: TEXT ('user' | 'admin')
- is_blocked: BOOLEAN
- created_at: TIMESTAMP
- last_sign_in_at: TIMESTAMP
```

**user_settings**
```sql
- id: BIGSERIAL (PK)
- user_id: UUID (FK → users.user_id)
- language: TEXT ('en' | 'uk' | 'ru')
- sidebar_pinned: BOOLEAN
- sidebar_width: INTEGER
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

**cards**
```sql
- id: BIGSERIAL (PK)
- user_id: UUID (FK → users.user_id)
- name: TEXT
- description: TEXT (Markdown + LaTeX)
- card_class: TEXT
- zone: INTEGER (1-7, для SRS)
- folder_id: INTEGER (nullable)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

**goals**
```sql
- id: BIGSERIAL (PK)
- user_id: UUID (FK → users.user_id)
- title: TEXT
- description: TEXT
- keywords: TEXT[]
- category: TEXT
- priority: TEXT
- deadline: TIMESTAMP
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

**goal_subgoals**
```sql
- id: BIGSERIAL (PK)
- goal_id: INTEGER (FK → goals.id)
- text: TEXT
- completed: BOOLEAN
- created_at: TIMESTAMP
```

**tasks**
```sql
- id: BIGSERIAL (PK)
- user_id: UUID (FK → users.user_id)
- topic: TEXT
- description: TEXT
- status: TEXT
- priority: TEXT
- deadline: TIMESTAMP
- status_history: JSON
- goal_id: INTEGER (FK → goals.id, nullable)
- subgoal_id: INTEGER (FK → goal_subgoals.id, nullable)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

**card_reviews**
```sql
- id: BIGSERIAL (PK)
- user_id: UUID (FK → users.user_id)
- card_id: INTEGER (FK → cards.id)
- current_zone: INTEGER
- started_at: TIMESTAMP
- finished_at: TIMESTAMP
```

**admin_logs** (опционально)
```sql
- id: BIGSERIAL (PK)
- admin_id: UUID (FK → users.user_id)
- action: TEXT
- details: JSON
- created_at: TIMESTAMP
```

### Supabase Storage Buckets

**card-images**
- Хранение аватаров пользователей
- Структура: `{user_id}/avatar_{user_id}_{uuid}.{ext}`
- Public access

### Row Level Security (RLS)

Таблицы защищены RLS политиками:
- Users могут читать/изменять только свои данные
- Admin client (service_role_key) обходит RLS

```typescript
// Regular client - применяется RLS
const { data } = await supabaseService.getClient()
  .from('cards')
  .select('*')
  .eq('user_id', userId);

// Admin client - обходит RLS
const { data } = await supabaseService.getAdminClient()
  .from('users')
  .select('*');
```

## 🌍 Environment Variables

### Необходимые переменные окружения

```env
# Supabase
SUPABASE_URL=https://xvcbxejefbigtrtugmaw.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JWT
JWT_SECRET=your-secret-key-here (минимум 32 символа)

# Server
NODE_ENV=development | production
PORT=8080 (или другой порт)

# Client (для CORS)
CLIENT_URL=http://localhost:3000 (dev) или https://smartmemory.vercel.app (prod)
PROD_CLIENT_URL=https://smartmemory.vercel.app

# API URL (для фронтенда)
NEXT_PUBLIC_API_URL=http://localhost:8080 (dev) или https://back-r5ry.onrender.com (prod)
```

### Загрузка переменных окружения

```typescript
// src/app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),  // Загружает .env файл
    // ...
  ],
})

// Использование
constructor(private configService: ConfigService) {
  const url = this.configService.get<string>('SUPABASE_URL');
}
```

## 🚀 Deployment

### Render (render.yaml)
```yaml
services:
  - type: web
    name: smartmemory-backend
    env: node
    buildCommand: npm install && npm run build
    startCommand: node dist/src/main.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
      - key: SUPABASE_URL
        value: https://xvcbxejefbigtrtugmaw.supabase.co
      # ... остальные переменные
```

**Deployment URL:** https://back-r5ry.onrender.com

### Railway (railway.json)
```json
{
  "builds": [
    {
      "src": "dist/main.js",
      "use": "@railway/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/main.js"
    }
  ]
}
```

### Production Checklist

1. ✅ `NODE_ENV=production`
2. ✅ Secure cookies (`secure: true, sameSite: 'none'`)
3. ✅ Trust proxy enabled (`trust proxy: 1`)
4. ✅ CORS настроен на production URL
5. ✅ Environment variables заданы на платформе
6. ✅ Build успешен (`npm run build`)
7. ✅ Start command: `node dist/src/main.js` или `npm run start:prod`

### CORS Configuration для Production

```typescript
// src/main.ts
const clientUrl = process.env.NODE_ENV === 'production'
  ? 'https://smartmemory.vercel.app'
  : 'http://localhost:3000';

app.enableCors({
  origin: clientUrl,
  credentials: true,  // КРИТИЧНО для cookies
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Pragma',
  ],
  exposedHeaders: ['Set-Cookie'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});
```

## 🧪 Development

### Команды
```bash
# Установка зависимостей
npm install

# Development сервер с hot-reload
npm run start:dev
# или
npm run dev

# Production build
npm run build

# Production сервер
npm run start:prod
# или
node dist/src/main.js

# Debug режим
npm run start:debug

# Linting
npm run lint

# Formatting
npm run format

# Testing
npm test                  # Unit tests
npm run test:watch        # Watch mode
npm run test:cov          # Coverage
npm run test:e2e          # E2E tests
```

### Development Server

```bash
# Запуск dev сервера
npm run start:dev

# Приложение запустится на:
# http://localhost:8080 (или PORT из .env)

# Hot reload при изменении файлов
# Логи всех запросов в консоль
```

### Особенности Development Mode

1. **Hot Reload**: автоматическая перезагрузка при изменении файлов
2. **Подробное логирование**: все запросы к `/auth/login` логируются
3. **CORS на localhost:3000**: фронтенд на локальном порту
4. **Cookies без secure**: `secure: false, sameSite: 'lax'`
5. **Trust proxy отключен**: не требуется для локальной разработки

### Debugging

Использование встроенного debugger:
```bash
npm run start:debug
```

Подключение VS Code debugger (`.vscode/launch.json`):
```json
{
  "type": "node",
  "request": "attach",
  "name": "Attach NestJS",
  "port": 9229,
  "restart": true
}
```

### Структура логов

```typescript
// src/main.ts - логирование /auth/login
console.log('=== INCOMING REQUEST DEBUG ===');
console.log('Method:', req.method);
console.log('Headers:', req.headers);
console.log('Body:', req.body);
```

## 💡 Особенности реализации

### 1. **Trust Proxy для Cookies**
Критично для работы secure cookies за прокси (Render, Railway, Cloudflare):
```typescript
// src/main.ts
app.getHttpAdapter().getInstance().set('trust proxy', 1);
```

### 2. **AllExceptionsFilter**
Глобальная обработка всех ошибок:
```typescript
// src/common/filters/http-exception.filter.ts
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Обработка HttpException, ошибок валидации, и прочих
  }
}

// src/main.ts
app.useGlobalFilters(new AllExceptionsFilter());
```

### 3. **Увеличенный лимит Body (50MB)**
Для загрузки больших изображений:
```typescript
// src/main.ts
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

### 4. **Multer для загрузки файлов**
```typescript
// src/user/user.controller.ts
const multerConfig: MulterOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, callback) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new BadRequestException('Invalid file type'), false);
    }
  },
};

@Post('avatar')
@UseInterceptors(FileInterceptor('avatar', multerConfig))
async uploadAvatar(@UploadedFile() file: Express.Multer.File) {
  // file.buffer содержит бинарные данные
}
```

### 5. **Supabase Storage для аватаров**
```typescript
// Загрузка
const { data } = await adminClient.storage
  .from('card-images')
  .upload(filePath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });

// Получение публичного URL
const { data: urlData } = adminClient.storage
  .from('card-images')
  .getPublicUrl(filePath);

// Удаление
await adminClient.storage
  .from('card-images')
  .remove([filePath]);
```

### 6. **Логирование запросов к /auth/login**
Подробное логирование для отладки проблем с аутентификацией:
```typescript
// src/main.ts
app.use('/auth/login', (req, res, next) => {
  console.log('=== RAW REQUEST BODY DEBUG ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Body.email:', req.body?.email);
  next();
});
```

### 7. **Валидация deadline**
Проверка, что дедлайн не в прошлом:
```typescript
// src/goals/goals.controller.ts
if (createGoalDto.deadline && new Date(createGoalDto.deadline) < new Date()) {
  throw new HttpException(
    'Deadline не может быть в прошлом',
    HttpStatus.BAD_REQUEST
  );
}
```

### 8. **История статусов задач**
Автоматическое отслеживание изменений статуса:
```typescript
// src/tasks/dto/create-task.dto.ts
export class StatusHistoryEntryDto {
  @IsIn(['not_completed', 'completed', 'not_needed', 'half_completed', 'urgent'])
  status: string;

  @IsDateString()
  timestamp: string;

  @IsIn(['created', 'status_changed'])
  action: string;
}
```

### 9. **Admin Role Check**
Централизованная проверка роли администратора:
```typescript
// src/admin/admin.controller.ts
private async checkAdminRole(userId: string) {
  const { data: userData } = await this.supabaseService
    .getClient()
    .from('users')
    .select('role')
    .eq('user_id', userId)
    .single();

  return userData?.role === 'admin';
}

// Использование в endpoint
const isAdmin = await this.checkAdminRole(req.user.id);
if (!isAdmin) {
  return {
    success: false,
    error: 'Доступ запрещен: требуется роль администратора',
    status: HttpStatus.FORBIDDEN,
  };
}
```

### 10. **Каскадное удаление пользователя**
При удалении пользователя удаляются все связанные данные:
```typescript
// src/admin/admin.controller.ts
// 1. Удаляем настройки
await supabase.from('user_settings').delete().eq('user_id', userId);

// 2. Удаляем карточки
await supabase.from('cards').delete().eq('user_id', userId);

// 3. Удаляем пользователя
await supabase.from('users').delete().eq('user_id', userId);

// 4. Удаляем из Auth
await supabase.auth.admin.deleteUser(userId);
```

## 📝 Соглашения по коду

### Структура файлов
- **Controllers**: `*.controller.ts` (PascalCase)
- **Services**: `*.service.ts` (PascalCase)
- **Modules**: `*.module.ts` (PascalCase)
- **DTOs**: `*.dto.ts` (kebab-case)
- **Entities**: `*.entity.ts` (kebab-case)
- **Guards**: `*.guard.ts` (kebab-case)
- **Filters**: `*.filter.ts` (kebab-case)
- **Middleware**: `*.middleware.ts` (kebab-case)

### Структура контроллера
```typescript
import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ServiceName } from './service-name.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('route-name')
@UseGuards(JwtAuthGuard)  // Защита всех маршрутов
export class ControllerName {
  constructor(private readonly serviceName: ServiceName) {}

  @Get()
  async findAll(@Req() req) {
    try {
      const userId = req.user.id;
      const data = await this.serviceName.findAll(userId);
      return { success: true, data };
    } catch (error) {
      console.error('Error:', error);
      return { 
        success: false, 
        error: error.message, 
        status: HttpStatus.INTERNAL_SERVER_ERROR 
      };
    }
  }
}
```

### Структура сервиса
```typescript
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ServiceName {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAll(userId: string) {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('table_name')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }
}
```

### Обработка ошибок

**В контроллерах:**
```typescript
try {
  // Логика
} catch (error) {
  console.error('Error description:', error);
  if (error instanceof HttpException) {
    throw error;
  }
  throw new HttpException(
    'Общее сообщение об ошибке',
    HttpStatus.INTERNAL_SERVER_ERROR
  );
}
```

**В сервисах:**
```typescript
if (error) {
  throw new InternalServerErrorException(`Описание ошибки: ${error.message}`);
}
```

### Naming Conventions

**Переменные и функции**: camelCase
```typescript
const userId = req.user.id;
async function getUserProfile() {}
```

**Классы**: PascalCase
```typescript
export class AuthController {}
export class CreateGoalDto {}
```

**Константы**: UPPER_SNAKE_CASE
```typescript
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png'];
```

**Приватные методы**: префикс `_` или без
```typescript
private async checkAdminRole() {}
private extractTokenFromRequest() {}
```

### TypeScript

**Типы для Request с user:**
```typescript
interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role?: string;
  };
}

async someMethod(@Req() req: AuthenticatedRequest) {
  const userId = req.user.id;  // TypeScript знает о типе
}
```

**Строгая типизация:**
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strictNullChecks": true,
    "noImplicitAny": false,
    "strictBindCallApply": false
  }
}
```

## 🔍 Типичные задачи

### Добавление нового endpoint

1. Создайте метод в контроллере:
```typescript
@Get('new-endpoint')
@UseGuards(JwtAuthGuard)
async newEndpoint(@Req() req) {
  try {
    const userId = req.user.id;
    const data = await this.serviceName.newMethod(userId);
    return { success: true, data };
  } catch (error) {
    console.error('Error:', error);
    throw new HttpException('Error message', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
```

2. Создайте метод в сервисе:
```typescript
async newMethod(userId: string) {
  const { data, error } = await this.supabaseService
    .getAdminClient()
    .from('table')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    throw new InternalServerErrorException(error.message);
  }

  return data;
}
```

### Добавление нового модуля

```bash
# Создание модуля через NestJS CLI
nest generate module module-name
nest generate controller module-name
nest generate service module-name
```

Затем импортируйте в `app.module.ts`:
```typescript
@Module({
  imports: [
    // ...
    ModuleNameModule,
  ],
})
export class AppModule {}
```

### Добавление валидации DTO

1. Создайте DTO файл:
```typescript
// src/module/dto/create-item.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

2. Используйте в контроллере:
```typescript
@Post()
async create(@Body() createItemDto: CreateItemDto) {
  // createItemDto уже валидирован автоматически
}
```

### Работа с Supabase

**Обычный клиент (с RLS):**
```typescript
const { data, error } = await this.supabaseService
  .getClient()
  .from('cards')
  .select('*')
  .eq('user_id', userId);
```

**Админ клиент (обход RLS):**
```typescript
const { data, error } = await this.supabaseService
  .getAdminClient()
  .from('users')
  .select('*');
```

**Загрузка файлов в Storage:**
```typescript
const { data, error } = await this.supabaseService
  .getAdminClient()
  .storage
  .from('bucket-name')
  .upload(filePath, fileBuffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });
```

### Добавление роли администратора

Проверка роли в контроллере:
```typescript
@Get('admin-only')
@UseGuards(JwtAuthGuard)
async adminOnlyEndpoint(@Req() req) {
  const { data: userData } = await this.supabaseService
    .getClient()
    .from('users')
    .select('role')
    .eq('user_id', req.user.id)
    .single();

  if (userData?.role !== 'admin') {
    throw new HttpException(
      'Доступ запрещен',
      HttpStatus.FORBIDDEN
    );
  }

  // Логика только для админа
}
```

## ⚠️ Важные замечания

1. **Trust Proxy**: ОБЯЗАТЕЛЬНО включить в production для работы secure cookies за прокси (`trust proxy: 1`)
2. **CORS Credentials**: ОБЯЗАТЕЛЬНО `credentials: true` для работы cookies в cross-domain запросах
3. **Supabase RLS**: Regular client применяет RLS, Admin client обходит (используйте с осторожностью)
4. **JWT Secret**: Должен быть длинным и секретным (минимум 32 символа)
5. **Cookie SameSite**: `'none'` в production для cross-domain, `'lax'` в development
6. **ValidationPipe**: Настроен глобально, автоматически валидирует все DTO
7. **HttpException**: Используйте специфичные исключения (BadRequestException, NotFoundException, etc.)
8. **Async/Await**: Всегда используйте async/await для работы с Supabase
9. **Error Handling**: Всегда оборачивайте в try/catch и логируйте ошибки
10. **File Upload**: Ограничение 5MB для аватаров, 50MB для body запроса
11. **Deadline Validation**: Всегда проверяйте, что deadline не в прошлом
12. **Admin Actions**: Админ не может изменить свою роль или удалить себя
13. **Password Strength**: RegisterDto требует сложный пароль (заглавные, строчные, цифры, спецсимволы)
14. **Email/Username Uniqueness**: Проверяется при регистрации и изменении

## 📚 Полезные ресурсы

- [NestJS Documentation](https://docs.nestjs.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [class-validator Decorators](https://github.com/typestack/class-validator)
- [JWT Documentation](https://jwt.io/)
- [Express Cookies](https://expressjs.com/en/api.html#res.cookie)

## 🔗 Связь с Frontend

Frontend URL: `https://smartmemory.vercel.app` (production)
Backend URL: `https://back-r5ry.onrender.com` (production)

**Важно:** Все запросы от фронтенда идут через BFF (`/api/bff/*`), который проксирует их на backend с корректными cookies.

## 📊 Статистика проекта

- **Модулей**: 8 (Auth, Cards, Goals, Tasks, User, Admin, Dictionary, Supabase)
- **Контроллеров**: 7
- **Сервисов**: 7
- **Guards**: 1 (JwtAuthGuard)
- **Filters**: 1 (AllExceptionsFilter)
- **DTO**: 10+
- **Endpoints**: 50+
- **База данных таблиц**: 7+

---

**Версия документации**: 1.0  
**Дата создания**: Октябрь 2025  
**Статус**: Production Ready ✅

