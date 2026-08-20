import { Module } from '@nestjs/common';
import { MapNodesController } from './map-nodes.controller';
import { MapNodesService } from './map-nodes.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MapNodesController],
  providers: [MapNodesService],
  exports: [MapNodesService],
})
export class MapNodesModule {}
