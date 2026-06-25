import { Module } from '@nestjs/common';
import { MapCardConnectionsController } from './map-card-connections.controller';
import { MapCardConnectionsService } from './map-card-connections.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MapCardConnectionsController],
  providers: [MapCardConnectionsService],
  exports: [MapCardConnectionsService],
})
export class MapCardConnectionsModule {}
