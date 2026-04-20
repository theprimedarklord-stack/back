# 🚀 Deploy на Dev Сервер — Швидкий Гайд

**Поточний статус:** cards рефактор завершен, нема помилок компіляції, готово до тестування

---

## Варіант 1: Швидка Локальна Перевірка (⚡ 5 хв)

### Перед Push де-небудь

```bash
# 1. Перевір компіляцію
npm run build

# 2. Запусти dev сервер локально
npm run start:dev

# 3. У VSCode REST Client:
#    Відкрий test-organizations-api.http
#    Додай тест для /cards endpoint
#    Перевір що відповідь правильна
```

**Чому:** Спіймати базові помилки перед push

---

## Варіант 2: Git Workflow (Рекомендується)

### Крок 1: Commit локально

```bash
cd c:\Users\user105\Desktop\SM\smartmemory-backend

git status  # Має показати змінені файли:
# - src/cards/cards.service.ts
# - src/cards/cards.controller.ts
# - docs/DATA_SERVICES_REFACTOR_GUIDE.md
# - docs/REFACTOR_PROGRESS.md
# - docs/REFACTOR_PHASE1_SUMMARY.md
# - docs/VERIFICATION_CHECKLIST.md
# - multiaccounting.md

git add src/cards docs/ multiaccounting.md

git commit -m "refactor(cards): примусити RLS через req.dbClient

- Додай client?: any параметр до всіх CardsService методів
- Реалізуй dual-path логіку (client → SQL; else → admin)
- Конвертуй Supabase запити у raw PostgreSQL
- Оновлю CardsController щоб передавав req.dbClient
- Додай Logger + error handling
- Включи comprehensive документацію"
```

### Крок 2: Перевір твою branch

```bash
git branch -v

# Ти маєш бути на:
# * dev       (якщо dev branch існує)
# * main      (можливо потрібно створити feature branch)
# * feature/rls-enforcement (рекомендується)

# Якщо на main і хочеш бути в безпеці:
git checkout -b feature/rls-enforcement-cards
```

### Крок 3: Push на remote

```bash
# Якщо на feature branch:
git push origin feature/rls-enforcement-cards

# Якщо на dev:
git push origin dev

# Вивід має показати:
# To github.com:your-org/smartmemory-backend.git
#  * [new branch] feature/rls-enforcement-cards -> feature/rls-enforcement-cards
```

---

## Варіант 3: Створи Pull Request (Найкраща Практика)

### На GitHub/GitLab

1. **Створи PR**
   - Назва: `refactor(cards): примусити RLS через req.dbClient`
   - Branch: `feature/rls-enforcement-cards` → `dev`
   - Опис:
     ```markdown
     ## Що
     Рефакторено CardsService щоб використовував req.dbClient замість admin client.
     
     ## Чому
     - Примусити RLS на рівні бази даних (не просто код)
     - Гарантувати cross-org ізоляцію даних
     - Зробити backend stateless та secure-by-default
     
     ## Змінення
     - CardsService: всі 9 методів тепер приймають client?: any
     - CardsController: передає req.dbClient сервісу
     - Документація: comprehensive рефактор гайд + чеклісти
     
     ## Як перевірити
     Див docs/VERIFICATION_CHECKLIST.md
     ```

2. **Запроси огляд**
   - Призначь team lead
   - Додай теги: `refactor`, `security`, `rls`

3. **Жди CI/CD**
   - Автоматичні тести запуститися
   - Якщо тести пройдуть → можна merge

---

## Варіант 4: Ручний Deploy на Dev (Якщо Нема CI/CD)

### Якщо у тебе є deploy скрипти

```bash
# Перевір чи у тебе є deploy скрипт:
ls -la scripts/ | grep -i deploy

# Якщо бачиш deploy.sh або подібне:
./scripts/deploy-dev.sh

# Або запитай: "Як ми deployємо на dev сервер?"
```

### Якщо у тебе є Docker

```bash
# Build образ
docker build -t smartmemory-backend:latest .

# Push у registry (GCR, DockerHub, etc)
docker push your-registry/smartmemory-backend:latest

# SSH на dev сервер та pull + restart
ssh dev-server
docker pull your-registry/smartmemory-backend:latest
docker-compose down
docker-compose up -d smartmemory-backend
```

---

## Варіант 5: Що я Рекомендую (🏆 Найкраще)

### Step-by-Step

1. **Спочатку тестуй локально:**
   ```bash
   npm run start:dev
   # Вручну перевір /cards endpoints працюють
   ```

2. **Commit з чітким повідомленням:**
   ```bash
   git add -A
   git commit -m "refactor(cards): RLS enforcement via req.dbClient"
   ```

3. **Push на feature branch:**
   ```bash
   git checkout -b feature/rls-cards-refactor
   git push origin feature/rls-cards-refactor
   ```

4. **Створи PR на GitHub:**
   - Посилання на docs/VERIFICATION_CHECKLIST.md
   - Запросити огляд

5. **Коли одобрено → Merge на dev:**
   - GitHub/GitLab UI → Merge
   - Або локально:
     ```bash
     git checkout dev
     git pull origin dev
     git merge feature/rls-cards-refactor
     git push origin dev
     ```

6. **CI/CD авто-deployiсь ЛИ ручний:**
   ```bash
   # Запитай DevOps людину:
   # "Feature merged на dev, можна deployнути?"
   ```

---

## Чеклист перед Push на dev

Перед push на dev, перевір:

```
✅ Код компілюється: npm run build
✅ Нема TypeScript помилок
✅ Нема runtime помилок локально
✅ Всі імпорти правильні
✅ Logger імпортований
✅ Error handling повний
✅ Нема breaking changes API (endpoints працюють так само)
✅ Backwards сумісний (fallback на admin client якщо no client)

✅ Документація оновлена:
   - docs/DATA_SERVICES_REFACTOR_GUIDE.md
   - docs/REFACTOR_PROGRESS.md
   - docs/VERIFICATION_CHECKLIST.md
   - multiaccounting.md

✅ Git повідомлення чітке
✅ Branch назва дескриптивна (feature/rls-cards-refactor)
✅ Нема sensitive даних в commit (нема secrets, passwords)
```

---

## Після Deploy на Dev

### Dev Server Тести

1. **Smoke Test**
   ```bash
   curl -H "Authorization: Bearer <token>" \
        http://dev.smartmemory.com/cards
   # Має повернути { "success": true, "cards": [...] }
   ```

2. **Моніторинг**
   - Перевір логи: `kubectl logs -f deployment/smartmemory-backend`
   - Перевір метрики: CPU, memory, error rate
   - Нема раптового збільшення помилок

3. **RLS Перевірка на Dev БД**
   ```bash
   # SSH на dev, підключися до БД:
   psql $DATABASE_URL -c "SELECT * FROM cards LIMIT 1;"
   # Має видавати тільки авторизовані картки
   ```

4. **Командний тест**
   - Скажи команді: "RLS рефактор deployed на dev"
   - Запитай: "Можеш протестувати /cards endpoints?"
   - Слідкуй за звітами про missing дані чи помилки

---

## Rollback (Якщо Щось Пішло Не Так)

```bash
# Якщо dev зламаний:
git revert <commit-hash>
git push origin dev

# Або повернись до попередньої версії:
git reset --hard <previous-commit-hash>
git push origin dev -f  # Force (будь обережний!)

# Якщо deployed та зламаний:
# Запитай DevOps: "Rollback deployment"
```

---

## Питання перед Deploy?

✅ **Чи у тебе є dev сервер запущений?**  
✅ **Хто керує deployments (DevOps, CI/CD, ручний)?**  
✅ **Чи у тебе є test database на dev?**  
✅ **Можеш доступатися до dev логів?**  

Якщо все ТАК → Ти готовий до deploy!

---

## TL;DR (Нетерплячавий Версія)

```bash
npm run build                    # Перевір нема помилок
npm run start:dev               # Швидкий локальний тест
git add -A                      # Stage зміни
git commit -m "refactor(cards): RLS enforcement"
git push origin dev             # Push на dev branch
# → Готово! CI/CD або manual deploy обирає решту
```

---

**Потрібна допомога з якимось кроком? Запитай!**

