import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ORG_KEY = 'requireOrg';

// По умолчанию мы считаем, что всем нужен x-org-id. 
// Но если передать false, интерцептор пропустит проверку.
export const RequireOrg = (require: boolean = true) => SetMetadata(REQUIRE_ORG_KEY, require);
