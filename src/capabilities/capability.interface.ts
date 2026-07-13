export interface ICapability {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly requiredAccessLevel: 'view' | 'comment' | 'edit' | 'execute' | 'admin';
  readonly configSchema?: object;
}

export interface IRuntimeCapability extends ICapability {
  readonly runtimeKind: string;
  validateConfig(config: any): { valid: boolean; errors?: string[] };
  getDefaultConfig(): Record<string, any>;
}
