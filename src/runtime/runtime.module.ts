import { Module } from '@nestjs/common';
import { RuntimeGateway } from './runtime.gateway';
import { DatabaseModule } from '../db/database.module';

import { RuntimeService } from './runtime.service';
import { DeviceService } from './device/device.service';
import { PairingService } from './device/pairing.service';
import { DeviceController } from './device/device.controller';
import { RuntimeTicketController } from './runtime-ticket.controller';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Module({
  imports: [DatabaseModule],
  controllers: [DeviceController, RuntimeTicketController],
  providers: [
    RuntimeGateway, 
    DeviceService, 
    PairingService, 
    RuntimeService,
    {
      provide: 'WS_REDIS',
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('WS_REDIS_URL') ?? configService.get<string>('REDIS_URL');
        if (!url) {
          throw new Error('WS_REDIS_URL (or REDIS_URL as fallback) must be set');
        }
        return new Redis(url);
      },
      inject: [ConfigService],
    }
  ],
})
export class RuntimeModule {}
