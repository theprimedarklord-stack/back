# ✅ ПРОВЕРКА: Cards RLS Enforcement

**Цель:** Убедиться что cards работает 100% + RLS enforced перед deployment на dev

---

## 1️⃣ Проверка компиляции локально

```bash
# В терминалі:
npm run build

# Ожидаемо: ✅ Нет ошибок компиляции
# Если ошибка: Проверь card*.ts файлы
```

**Статус:** _________________ 

---

## 2️⃣ Запуск dev сервера

```bash
# Терминал 1:
npm run start:dev

# Жди этого сообщения:
# [Nest] XXXX - 01/29/2026, X:XX:XX AM     LOG [NestFactory] Nest application successfully started +1234ms

# Если ошибка: Проверь логи DatabaseService подключения
```

**Статус:** _________________ 

---

## 3️⃣ Тест: GET /cards (Валидный пользователь)

### Setup
```bash
# Отримай валидний JWT токен:
# 1. Відкрий фронтенд (http://localhost:3000)
# 2. Логінься як будь-яким користувачем
# 3. Відкрий DevTools → Application → Cookies
# 4. Скопіюй "auth-token" або подібний JWT

# Скопіюй у clipboard, використовуй як {{token}} нижче
```

### Тестовий запит
```http
GET http://localhost:3333/cards
Authorization: Bearer {{token}}
x-org-id: {{your-org-id}}  (опціонально, але рекомендується)
```

### Очікувана відповідь
```json
{
  "success": true,
  "cards": [
    {
      "id": "uuid-here",
      "user_id": "твій-user-id",
      "name": "Назва картки",
      "description": "...",
      "created_at": "2026-01-29T...",
      ...
    }
  ]
}
```

**Статус:** _________________ 
**Замітки:** 

---

## 4️⃣ Тест: POST /cards (Створення)

### Test Request
```http
POST http://localhost:3333/cards
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "name": "Test Card RLS",
  "description": "Created during RLS verification",
  "card_class": "test",
  "zone": "zone1"
}
```

### Expected Response
```json
{
  "success": true,
  "card": {
    "id": "new-uuid",
    "user_id": "your-user-id",
    "name": "Test Card RLS",
    "description": "...",
    "current_streak": 0,
    "created_at": "2026-01-29T...",
    "updated_at": "2026-01-29T..."
  }
}
```

**Status:** _________________ 
**Card ID Created:** ________________________________

---

## 5️⃣ Test: PATCH /cards/:id (Update)

### Test Request
```http
PATCH http://localhost:3333/cards/{{card-id-from-prev-step}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "name": "Updated Card Name",
  "current_streak": 5
}
```

### Expected Response
```json
{
  "success": true,
  "card": {
    "id": "...",
    "user_id": "your-user-id",
    "name": "Updated Card Name",
    "current_streak": 5,
    "updated_at": "2026-01-29T...(newer)"
  }
}
```

**Status:** _________________ 

---

## 6️⃣ Test: DELETE /cards/:id (Delete)

### Test Request
```http
DELETE http://localhost:3333/cards/{{card-id-from-prev-step}}
Authorization: Bearer {{token}}
```

### Expected Response
```json
{
  "success": true,
  "message": "Карточка удалена"
}
```

**Status:** _________________ 

---

## 7️⃣ 🔐 CRITICAL: RLS Isolation Test

### Test A: Cannot See Other User's Card

**Setup:**
1. Create card as **User A**
2. Get another card ID from **User B** (ask colleague or create 2nd account)
3. Try to fetch User B's card as User A

### Test Request
```http
GET http://localhost:3333/cards/{{user-b-card-id}}
Authorization: Bearer {{user-a-token}}
```

### Expected Response
```json
{
  "success": true,
  "cards": []
}

// OR 404 Not Found (even better - data doesn't exist for this user)
```

### ❌ If You Get User B's Card Data
```json
{
  "success": true,
  "cards": [
    {
      "user_id": "user-b-uuid",  // ❌ THIS MEANS RLS FAILED
      ...
    }
  ]
}
```

**⚠️ STOP → Check:**
- [ ] Is RlsContextInterceptor registered in app.module.ts?
- [ ] Is DatabaseService.withOrgContext() being called?
- [ ] Is `set_config('app.org_id', ...)` happening?
- [ ] Did RLS migration apply to cards table?

**Status:** _________________ 
**Result:** ✅ PASSED / ❌ FAILED

---

## 8️⃣ Test: Verify Logging

### In Terminal (where server is running)
```bash
# Watch logs for patterns:
# 1. "Fetched X records for user Y"
# 2. No errors
# 3. Request time < 100ms

# Example good log:
[NestFactory] CardsService - DEBUG Fetched 3 records for user 550e8400-e29b-41d3-a567-426614174000
```

**Status:** _________________ 

---

## 9️⃣ Test: RLS Error Case (Missing org_id header)

### Test Request (⚠️ intentional error)
```http
GET http://localhost:3333/cards
Authorization: Bearer {{token}}
# NO x-org-id header
```

### Expected
- Either:
  1. Still works (uses fallback org logic from ContextBuilder)
  2. Returns 409 Conflict (no org resolved)

### What Should NOT Happen
- ❌ Returns all cards regardless of org
- ❌ 500 Internal Server Error

**Status:** _________________ 

---

## 🔟 Database Verification (Optional but Recommended)

### Connect to DB Directly

```bash
# Get DATABASE_URL from .env
psql $DATABASE_URL

# In psql:
SELECT current_setting('app.org_id');
# → Should show uuid or NULL (depends on context)

# Check RLS is enabled:
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='cards';
SELECT * FROM pg_policies WHERE tablename='cards';
# → Should show RLS policy on cards table
```

**Status:** _________________ 

---

## ✅ All Tests Passed?

If YES → You can proceed to:

```bash
git add .
git commit -m "feat: refactor cards service under req.dbClient for RLS enforcement"
git push origin dev  # or your feature branch
```

---

## 📋 Summary

```
Test 1: Compilation       ✅/❌
Test 2: Server Start      ✅/❌
Test 3: GET /cards        ✅/❌
Test 4: POST /cards       ✅/❌
Test 5: PATCH /cards/:id  ✅/❌
Test 6: DELETE /cards/:id ✅/❌
Test 7: RLS Isolation     ✅/❌ (CRITICAL)
Test 8: Logging           ✅/❌
Test 9: Error Cases       ✅/❌
Test 10: DB Verification  ✅/❌ (Optional)

═══════════════════════════════════════════
Overall Status: ✅ READY FOR DEV / ❌ NEEDS FIX
═══════════════════════════════════════════
```

---

## If Tests Fail

### Common Issues:

**Issue:** `Cannot read property 'query' of undefined (req.dbClient is null)`
```
Fix: Check RlsContextInterceptor is registered in app.module.ts
     Check JwtAuthGuard is used before endpoint
```

**Issue:** `relation "cards" does not exist`
```
Fix: Make sure cards table exists in your DB
     Run migrations: npm run typeorm migration:run
```

**Issue:** `RLS returns empty array when should return data`
```
Fix: Check app.org_id is set correctly
     Check user_id column has correct value
     Check RLS policy condition
```

**Issue:** `Can see other user's data (RLS not enforced)`
```
Fix: CRITICAL! Check:
     1. set_config('app.org_id') is called
     2. RLS policy uses get_app_org_id()
     3. DatabaseService.withOrgContext() wraps the query
```

---

## Next Steps After Verification ✅

1. **Commit locally:**
   ```bash
   git add src/cards docs/
   git commit -m "refactor(cards): add RLS enforcement via req.dbClient"
   ```

2. **Push to dev branch:**
   ```bash
   git push origin dev  # or feature/rls-enforcement
   ```

3. **Create Pull Request:**
   - Title: "refactor(cards): add RLS enforcement via req.dbClient"
   - Description: Link to [DATA_SERVICES_REFACTOR_GUIDE.md](./DATA_SERVICES_REFACTOR_GUIDE.md)
   - Reviewers: team lead

4. **Deploy to dev server:**
   - CI/CD pipeline should run tests
   - If tests pass → automatically deploy to dev
   - Or manually deploy if your workflow requires it

