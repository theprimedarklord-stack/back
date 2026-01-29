# Data Services Refactor Progress & Checklist

**Status:** Phase 2 - Starting

---

## ✅ COMPLETED

### cards
- [x] `src/cards/cards.service.ts` — refactored (9 methods, all with client param)
- [x] `src/cards/cards.controller.ts` — updated to pass `req.dbClient`
- Reference: [see implementation](../src/cards/cards.service.ts#L1-L50)

---

## 📋 IN PROGRESS (Phase 2)

### tasks
**Files:** `src/tasks/tasks.service.ts`, `src/tasks/tasks.controller.ts`

**Methods to refactor:**
- [ ] `getTasks(userId, orgId, client?)`
- [ ] `createTask(userId, orgId, taskData, client?)`
- [ ] `updateTask(userId, taskId, taskData, client?)`
- [ ] `deleteTask(userId, taskId, client?)`
- [ ] `getTaskById(userId, taskId, client?)`
- [ ] (any other methods)

**Status:** Not started
**Difficulty:** Medium (similar to cards)
**Est. Time:** 30-45 min

**Checklist:**
```
- [ ] Read tasks.service.ts completely
- [ ] Identify all query methods
- [ ] Add client?: any to each
- [ ] Convert Supabase queries → raw SQL
- [ ] Add dual-path (if client; else admin)
- [ ] Update tasks.controller.ts to pass req.dbClient
- [ ] Test locally with valid/invalid user
- [ ] Verify no regression in /tasks endpoints
```

---

### mapcards
**Files:** `src/mapcards/mapcards.service.ts`, `src/mapcards/mapcards.controller.ts`

**Methods to refactor:**
- [ ] `getMapcards(userId, client?)`
- [ ] `createMapcard(userId, data, client?)`
- [ ] `updateMapcard(userId, id, data, client?)`
- [ ] `deleteMapcard(userId, id, client?)`
- [ ] (any other methods)

**Status:** Not started
**Difficulty:** Medium
**Est. Time:** 30-45 min

**Checklist:**
```
- [ ] Read mapcards.service.ts completely
- [ ] Identify all query methods
- [ ] Add client?: any to each
- [ ] Convert Supabase queries → raw SQL
- [ ] Add dual-path logic
- [ ] Update mapcards.controller.ts
- [ ] Test locally
```

---

### goals
**Files:** `src/goals/goals.service.ts`, `src/goals/goals.controller.ts`

**Methods to refactor:**
- [ ] `getGoals(userId, client?)`
- [ ] `createGoal(userId, data, client?)`
- [ ] `updateGoal(userId, id, data, client?)`
- [ ] `deleteGoal(userId, id, client?)`
- [ ] (any other methods)

**Status:** Not started
**Difficulty:** Medium
**Est. Time:** 30-45 min

**Checklist:**
```
- [ ] Read goals.service.ts
- [ ] Identify all query methods
- [ ] Add client?: any
- [ ] Convert Supabase → SQL
- [ ] Update controller
- [ ] Test
```

---

## 🔄 PHASE 3 (Lower Priority)

### suggestions
**Status:** Not started
**Notes:** Check if org-scoped or user-scoped

### dictionary
**Status:** Not started
**Notes:** May be shared/read-only, check structure

### user
**Status:** Not started
**Notes:** User profile data, check if scoped

---

## 🛑 INTENTIONALLY SKIPPED (By Design)

### admin
- Should bypass RLS intentionally
- Keep admin client usage
- No refactor needed

### auth
- Authentication layer, not data-plane
- Uses Cognito
- No refactor needed

### org-projects, organizations
- Already partially refactored
- Use req.dbClient where needed
- Check if complete

---

## 📊 Progress Summary

```
Total modules: 11 data-services
Completed:   1  (cards) .................... 9%
In Progress: 3  (tasks, mapcards, goals)  27% (est)
To Do:       7  (suggestions, dictionary, user, etc.)
Skipped:     2  (admin, auth)

Overall Progress: ████░░░░░░░░░░░░░░░░░░░░░░ 20%
```

---

## 🎯 Next Steps

### Immediate (Right Now)
1. **Choose next module:** tasks, mapcards, or goals?
2. **Follow cards pattern exactly** (reference implementation)
3. **Test after each module**

### After Phase 2 Complete
1. Run full audit: `grep -r "getClient()" src/` → find any stragglers
2. Add eslint rule to prevent future `.getClient()` in services
3. Document final checklist

### Final Verification
1. Test cross-user isolation (user A cannot see user B data)
2. Test cross-org isolation (if applicable)
3. Check audit logs (who fetched what)

---

## 💡 Pro Tips

### Copy-Paste From cards
All SQL patterns are in [cards.service.ts](../src/cards/cards.service.ts):
- SELECT example: line 28-34
- INSERT example: line 53-63
- UPDATE example: line 99-115
- DELETE example: line 152-156
- Error handling: throughout

### Test Quickly
```bash
# In test-organizations-api.http, add endpoint tests:
GET http://localhost:3333/tasks
Authorization: Bearer {{token}}

# Should get only authenticated user's tasks
```

### Verify RLS Works
```bash
# Terminal check:
psql $DATABASE_URL -c "SELECT current_setting('app.org_id');"
# Should show the org_id set by interceptor
```

---

## Questions or Blockers?

Reference: [DATA_SERVICES_REFACTOR_GUIDE.md](./DATA_SERVICES_REFACTOR_GUIDE.md)
