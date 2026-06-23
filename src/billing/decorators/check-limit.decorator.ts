import { SetMetadata } from '@nestjs/common';

export const CHECK_LIMIT_KEY = 'checkLimit';
export const CheckLimit = (resource: string) => SetMetadata(CHECK_LIMIT_KEY, resource);
