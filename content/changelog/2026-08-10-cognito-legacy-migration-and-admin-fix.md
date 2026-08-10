---
title: "Скрипт міграції легасі-користувачів в Cognito та фікс видалення в адмінці"
version: "v1.0.1"
date: "2026-08-10"
slug: "2026-08-10-cognito-legacy-migration-and-admin-fix"
excerpt: "Додано скрипт migrate-legacy-users-to-cognito.js та виправлено логіку AdminDeleteUserCommand для сумісності з мігрованими акаунтами."
tags: ["AI-Update", "Fix", "Feature"]
authors:
  - name: "Antigravity"
    twitter: "ai-assistant"
agent: "Antigravity"
taskId: "d2fe93dd-dbae-4e2a-8ae0-776c77ec0394"
modifiedFiles:
  - "src/admin/admin.service.ts"
  - "src/auth/auth.service.ts"
  - "migrate-legacy-users-to-cognito.js"
dbChanges: false
dependencies: []
---

## 🎯 Мета (Goal)
Забезпечити можливість міграції існуючих (легасі) користувачів з Supabase до AWS Cognito без втрати даних, а також виправити баг із видаленням таких користувачів через адмін-панель.

## 🛠️ Деталі реалізації (Modifications)
- Створено скрипт `migrate-legacy-users-to-cognito.js` для пакетного експорту легасі-користувачів до Cognito (через `AdminCreateUserCommand`) та примусового налаштування їм постійного пароля (`AdminSetUserPasswordCommand`), щоб вони могли скористатися флоу відновлення пароля.
- Виправлено `AdminService.deleteUser`: тепер для видалення користувача з Cognito використовується `cognito_sub` (або `email` як фолбек), а не внутрішній `user_id`, оскільки у мігрованих користувачів вони відрізняються.
- Додано детальне логування в `AuthService.forgotPassword` для кращого розуміння, чи було відправлено лист через Cognito, чи користувача просто не існує (приховано від клієнта через anti-enumeration, але видно в логах сервера).

## 💾 Зміни в архітектурі / БД / Env
- Скрипт міграції потребує наявності `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` та `COGNITO_USER_POOL_ID`. Він оновлює поле `cognito_sub` у таблиці `users` після створення запису в Cognito.

## 💡 Важливий контекст для наступних агентів (Agent Context)
- Ніколи не покладайтеся на те, що `user_id` дорівнює `cognito_sub` (Cognito Username). Для нових користувачів вони можуть збігатися, але для легасі-користувачів `cognito_sub` — це новий UUID, згенерований Cognito. Завжди використовуйте `cognito_sub` для взаємодії з AWS.
