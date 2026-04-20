import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Помечает роут как публичный — все гварды должны игнорировать маршруты
 * с этим декоратором (проверяя metadata IS_PUBLIC_KEY).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
