import { Request } from 'express';
import { PoolClient } from 'pg';

/**
 * Інтерфейс користувача, як він формується в CognitoAuthGuard.
 * Поля відповідають реальній мутації request['user'] у guard (рядки 141-147).
 * TODO [REFACTOR]: Розглянути перехід на snake_case (user_id, cognito_sub) — Варіант B.
 */
export interface AuthenticatedUser {
  userId: string;       // UUID з таблиці users (primary, використовується RlsContextInterceptor)
  id: string;           // Legacy alias для userId
  sub: string;          // Cognito sub (оригінальний)
  email: string;
  claims: Record<string, unknown>;
}

/**
 * Розширений об'єкт Request після проходження CognitoAuthGuard + RlsContextInterceptor.
 * Використовувати замість `any` у всіх контролерах, що потребують автентифікації.
 */
export interface AuthenticatedRequest extends Request {
  dbClient: PoolClient;       // Інжектується через RlsContextInterceptor (транзакція з SET LOCAL)
  user: AuthenticatedUser;    // Інжектується через CognitoAuthGuard
  headers: Request['headers'] & {
    'x-org-id'?: string;
  };
}
