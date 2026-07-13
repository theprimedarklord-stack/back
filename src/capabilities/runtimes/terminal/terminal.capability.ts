import { IRuntimeCapability } from '../../capability.interface';

export class TerminalCapability implements IRuntimeCapability {
  slug = 'terminal';
  name = 'Terminal';
  description = 'Provides remote terminal access';
  requiredAccessLevel = 'execute' as const;
  runtimeKind = 'terminal';

  validateConfig(config: { cols?: number; rows?: number }) {
    if (config?.cols !== undefined && typeof config.cols !== 'number') return { valid: false, errors: ['cols must be a number'] };
    if (config?.rows !== undefined && typeof config.rows !== 'number') return { valid: false, errors: ['rows must be a number'] };
    return { valid: true };
  }

  getDefaultConfig() {
    return { cols: 80, rows: 24 };
  }
}
