import { Module } from '@nestjs/common';
import { CapabilityRegistry } from './capability.registry';

@Module({
  providers: [CapabilityRegistry],
  exports: [CapabilityRegistry],
})
export class CapabilitiesModule {}
