import { Module } from '@nestjs/common';
import { RuntimeGateway } from './runtime.gateway';
import { DatabaseModule } from '../db/database.module';

import { RuntimeService } from './runtime.service';
import { DeviceService } from './device/device.service';
import { PairingService } from './device/pairing.service';
import { DeviceController } from './device/device.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [DeviceController],
  providers: [RuntimeGateway, DeviceService, PairingService, RuntimeService],
})
export class RuntimeModule {}
