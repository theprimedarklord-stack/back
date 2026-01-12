import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TelemetryAuthService } from './telemetry-auth.service';
import { TelemetryDatabaseService } from './database.service';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    TelemetryAuthService,
    TelemetryDatabaseService,
  ],
  exports: [TelemetryService],
})
export class TelemetryModule {}
