import { Injectable } from '@nestjs/common';
import { ICapability, IRuntimeCapability } from './capability.interface';
import { TerminalCapability } from './runtimes/terminal/terminal.capability';

@Injectable()
export class CapabilityRegistry {
  private capabilities = new Map<string, ICapability>();
  private runtimes = new Map<string, IRuntimeCapability>();

  constructor() {
    this.registerRuntime(new TerminalCapability());
  }

  register(capability: ICapability): void {
    this.capabilities.set(capability.slug, capability);
  }

  registerRuntime(runtime: IRuntimeCapability): void {
    this.runtimes.set(runtime.slug, runtime);
    this.capabilities.set(runtime.slug, runtime);
  }

  get(slug: string): ICapability | undefined {
    return this.capabilities.get(slug);
  }

  getRuntime(type: string): IRuntimeCapability | undefined {
    return this.runtimes.get(type);
  }

  listAll(): ICapability[] {
    return Array.from(this.capabilities.values());
  }

  listRuntimes(): IRuntimeCapability[] {
    return Array.from(this.runtimes.values());
  }

  isSupported(deviceCapabilities: string[], runtimeKind: string): boolean {
    return deviceCapabilities.includes(runtimeKind);
  }
}
