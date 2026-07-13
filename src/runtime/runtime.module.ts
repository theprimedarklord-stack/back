import { Module } from '@nestjs/common';
import { RuntimeGateway } from './runtime.gateway';
import { DatabaseModule } from '../db/database.module';

import { DeviceService } from './device/device.service';
import { PairingService } from './device/pairing.service';
import { DeviceController } from './device/device.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [DeviceController],
  providers: [RuntimeGateway, DeviceService, PairingService],
})
export class RuntimeModule {}
