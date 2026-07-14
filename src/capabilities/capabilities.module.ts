import { Module } from '@nestjs/common';
import { CapabilityRegistry } from './capability.registry';
import { CapabilitiesController } from './capabilities.controller';
import { CapabilitiesService } from './capabilities.service';
import { DatabaseModule } from '../db/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CapabilitiesController],
  providers: [CapabilityRegistry, CapabilitiesService],
  exports: [CapabilityRegistry, CapabilitiesService],
})
export class CapabilitiesModule {}
