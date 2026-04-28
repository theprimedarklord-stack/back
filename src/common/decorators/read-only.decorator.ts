import { SetMetadata } from '@nestjs/common';

export const READ_ONLY_KEY = 'readOnly';

/**
 * Marks endpoint as read-only DB workload.
 * Used by RlsContextInterceptor to avoid BEGIN/COMMIT and reduce round-trips,
 * while still safely setting and resetting session vars in pooled connections.
 */
export const ReadOnly = () => SetMetadata(READ_ONLY_KEY, true);

