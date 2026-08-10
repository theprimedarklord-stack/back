---
title: "Додано ендпоінти для відновлення пароля (Cognito)"
version: "v1.0.0"
date: "2026-08-10"
slug: "2026-08-10-forgot-password-endpoints"
excerpt: "Реалізовано методи forgotPassword та confirmForgotPassword в AuthService для взаємодії з Cognito."
tags: ["AI-Update", "Feature"]
authors:
  - name: "Antigravity"
    twitter: "ai-assistant"
agent: "Antigravity"
taskId: "d2fe93dd-dbae-4e2a-8ae0-776c77ec0394"
modifiedFiles:
  - "src/auth/auth.controller.ts"
  - "src/auth/auth.dto.ts"
  - "src/auth/auth.service.ts"
dbChanges: false
dependencies: []
---

## 🎯 Мета (Goal)
Надати можливість користувачам відновлювати забуті паролі за допомогою AWS Cognito, з відповідними DTO для валідації та rate limiting для захисту від перебору та спаму.

## 🛠️ Деталі реалізації (Modifications)
- Додано `ForgotPasswordDto` та `ConfirmForgotPasswordDto` у `src/auth/auth.dto.ts` для валідації вхідних даних.
- Реалізовано методи `forgotPassword` та `confirmForgotPassword` у `src/auth/auth.service.ts` із використанням команд `@aws-sdk/client-cognito-identity-provider`.
- Додано відповідні маршрути `/auth/forgot-password` та `/auth/confirm-forgot-password` у `src/auth/auth.controller.ts` із захистом `@Throttle`.
- Імплементовано анти-енумерацію (anti-enumeration) email-адрес: при запиті відновлення пароля API не розкриває, чи існує email в базі.

## 💾 Зміни в архітектурі / БД / Env
Без змін.

## 💡 Важливий контекст для наступних агентів (Agent Context)
- Обробка помилок `CodeMismatchException` та `UserNotFoundException` при підтвердженні зроблена ідентичною з метою безпеки.
