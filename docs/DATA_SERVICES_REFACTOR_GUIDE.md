# Data Services Refactor Guide — RLS Enforcement

## Overview

**Goal:** Ensure all data-plane queries respect RLS by using `req.dbClient` instead of `supabaseService.getClient()`.

**Result:** Backend becomes stateless + secure-by-default. RLS is the enforcement boundary, not just a policy.

---

## Architecture

### Flow
```
Request → RlsContextInterceptor → set_config('app.org_id', orgId) → req.dbClient
         ↓
    Service receives req.dbClient
         ↓
    SQL queries run under RLS context
         ↓
    Database enforces org isolation
```

### Before (❌ Insecure)
```typescript
// In service
const { data } = await this.supabaseService.getClient()
  .from('cards')
  .select('*');
// ⚠️ Supabase client ignores RLS, gets all cards regardless of org
```

### After (✅ Secure)
```typescript
// In service
const sql = `SELECT * FROM cards WHERE user_id = $1`;
const { rows } = await client.query(sql, [userId]);
// ✅ Database enforces app.org_id context, blocks unauthorized rows
```

---

## Refactor Pattern

### Step 1: Service Method Signature

**Add `client?: any` parameter:**

```typescript
// Before
async getCards(userId: string) { ... }

// After
async getCards(userId: string, client?: any) { ... }
```

### Step 2: Dual Path Logic

**If client provided → raw SQL; else → fallback to admin client:**

```typescript
async getCards(userId: string, client?: any) {
  if (client) {
    // RLS-enabled path
    const sql = `SELECT * FROM cards WHERE user_id = $1`;
    const res = await client.query(sql, [userId]);
    return res.rows;
  }

  // Fallback (for legacy or admin flows)
  const { data, error } = await this.supabaseService
    .getClient()
    .from('cards')
    .select('*')
    .eq('user_id', userId);
  
  return data;
}
```

### Step 3: Controller Passes Client

```typescript
// In controller
private getDbClient(req: Request): any {
  return (req as any).dbClient;
}

@Get()
async getCards(@Req() req: Request) {
  const userId = req.user?.userId;
  const client = this.getDbClient(req);
  // Pass client to service
  const cards = await this.cardsService.getCards(userId, client);
  return cards;
}
```

---

## Modules to Refactor

### Priority 1 (Core Data)
- [x] **cards** ← DONE (pilot)
- [ ] **tasks** — likely high-volume, user-facing
- [ ] **mapcards** — associated with cards
- [ ] **goals** — similar structure to tasks

### Priority 2 (Supporting Data)
- [ ] **suggestions** — possibly org-scoped
- [ ] **dictionary** — possibly shared/org-scoped
- [ ] **user** — profile data

### Priority 3 (Optional)
- [ ] **ai** — if data-driven, may need RLS
- [ ] **admin** — intentionally should bypass RLS

---

## Checklist per Module

Use this for each data service:

```
Module: _________

Service File: src/<module>/<module>.service.ts
Controller File: src/<module>/<module>.controller.ts

Tasks:
- [ ] Identify all methods that query database
- [ ] Add `client?: any` param to each method
- [ ] Implement dual-path logic (if client → SQL; else → admin)
- [ ] Convert Supabase `.select()` → raw SQL with WHERE user_id/$1 or org_id/$1
- [ ] Add error handling + Logger
- [ ] Update controller to extract dbClient and pass to service
- [ ] Test locally with valid user context
- [ ] Verify invalid users get 403/empty result (RLS enforced)

Files Changed:
- [ ] service.ts
- [ ] controller.ts
- [ ] module.ts (if needed)

Notes:
```

---

## SQL Conversion Examples

### Example 1: Simple SELECT

**Supabase style:**
```typescript
const { data } = await this.supabaseService
  .getClient()
  .from('tasks')
  .select('*')
  .eq('user_id', userId);
```

**Raw SQL (RLS-enabled):**
```typescript
const sql = `
  SELECT id, user_id, title, description, status, created_at, updated_at
  FROM tasks
  WHERE user_id = $1
  ORDER BY created_at DESC
`;
const { rows } = await client.query(sql, [userId]);
```

---

### Example 2: INSERT with RETURNING

**Supabase style:**
```typescript
const { data } = await this.supabaseService
  .getClient()
  .from('tasks')
  .insert({ user_id: userId, title: 'New Task' })
  .select()
  .single();
```

**Raw SQL:**
```typescript
const sql = `
  INSERT INTO tasks (user_id, title, created_at, updated_at)
  VALUES ($1, $2, NOW(), NOW())
  RETURNING id, user_id, title, created_at, updated_at
`;
const { rows } = await client.query(sql, [userId, title]);
return rows[0];
```

---

### Example 3: UPDATE with Condition

**Supabase style:**
```typescript
const { data } = await this.supabaseService
  .getClient()
  .from('tasks')
  .update({ status: 'done' })
  .eq('id', taskId)
  .eq('user_id', userId)
  .select()
  .single();
```

**Raw SQL:**
```typescript
const sql = `
  UPDATE tasks
  SET status = $1, updated_at = NOW()
  WHERE id = $2 AND user_id = $3
  RETURNING id, user_id, title, status, created_at, updated_at
`;
const { rows } = await client.query(sql, ['done', taskId, userId]);
return rows[0];
```

---

### Example 4: DELETE with Cascade

**Supabase style:**
```typescript
const { error } = await this.supabaseService
  .getClient()
  .from('tasks')
  .delete()
  .eq('id', taskId)
  .eq('user_id', userId);
```

**Raw SQL:**
```typescript
const sql = `
  DELETE FROM tasks
  WHERE id = $1 AND user_id = $2
  RETURNING id
`;
const { rows } = await client.query(sql, [taskId, userId]);
return rows.length > 0;
```

---

## RLS Verification Checklist

After refactoring a module, verify RLS works:

### 1. Correct User Sees Their Data
```bash
# As user A, GET /module/data
# Should see only user A's records
```

### 2. Wrong User Cannot Access
```bash
# As user A, try to GET /module/{user-b-record-id}
# Should get 403 Forbidden or 404 Not Found (not 200 with data)
```

### 3. Cross-Org Isolation (if org-scoped)
```bash
# User is member of Org1 and Org2
# Request with x-org-id: Org1 should only see Org1 data
# Set org_id in context via app.org_id → RLS enforces
```

### 4. Admin Path Still Works
```bash
# POST /admin/users/{user-id}/impersonate → sets realUserId
# Impersonated user sees impersonated user's data only
# (not the original user's data)
```

---

## Logging & Monitoring

Add logging for observability:

```typescript
import { Logger } from '@nestjs/common';

export class MyService {
  private readonly logger = new Logger(MyService.name);

  async getRecords(userId: string, client?: any) {
    try {
      const sql = `SELECT * FROM my_table WHERE user_id = $1`;
      const res = await client.query(sql, [userId]);
      this.logger.debug(`Fetched ${res.rows.length} records for user ${userId}`);
      return res.rows;
    } catch (error) {
      this.logger.error(`Failed to fetch records for user ${userId}`, error);
      throw error;
    }
  }
}
```

---

## Testing Strategy

### Unit Tests (Mock client)
```typescript
it('should return user records only', async () => {
  const mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [{ id: '1', user_id: userId }] })
  };
  const result = await service.getRecords(userId, mockClient);
  expect(result).toHaveLength(1);
  expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [userId]);
});
```

### Integration Tests (Real DB)
```typescript
it('should enforce RLS isolation', async () => {
  // Create users A and B with records
  const userA = await createUser();
  const userB = await createUser();
  const recordA = await createRecord(userA.id, 'My Record');
  
  // Set app.org_id context for userA
  // Query as userA
  const result = await service.getRecords(userA.id, dbClientUnderRLS);
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe(recordA.id);
});
```

---

## Gradual Rollout

### Phase 1: Cards (DONE)
- ✅ Service refactored
- ✅ Controller updated
- ✅ Tested locally

### Phase 2: Tasks + Mapcards + Goals
- Parallel refactoring
- Follow **cards** pattern exactly

### Phase 3: Remaining Modules
- dictionary, suggestions, user, etc.

### Phase 4: Verify + Lock Down
- Audit all services for `.getClient()` calls
- Add linting rule: forbid `.getClient()` in data-paths
- Lock production to RLS-only mode

---

## Anti-Patterns (⛔ Don't Do)

```typescript
// ❌ BAD: Ignoring client parameter
async getRecords(userId: string, client?: any) {
  // Client provided but ignored!
  const { data } = await this.supabaseService.getClient()...
}

// ❌ BAD: Not filtering by org_id / user_id
const sql = `SELECT * FROM records`;
// RLS doesn't know which org, returns nothing or error

// ❌ BAD: Admin client in data-path
async getData(orgId: string) {
  // Should pass client, not create new admin client
  return await this.supabaseService.getAdminClient().from(...).select();
}

// ❌ BAD: No fallback on error
async getData(userId: string, client?: any) {
  // If client.query fails, exception propagates unhandled
  const res = await client.query(sql, [userId]); // ← needs try/catch
}
```

---

## Success Criteria

✅ All data-services pass `req.dbClient` from controller  
✅ No `.getClient()` calls in service data-paths  
✅ RLS policies enforced: org_id and user_id filtering work  
✅ Cross-org data isolation verified  
✅ Logging shows which user fetched what  
✅ Tests pass locally and in CI  

---

## Questions?

Refer to [cards](../src/cards/) module as the reference implementation.
