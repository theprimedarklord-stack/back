import { Module } from '@nestjs/common';
import { MapCanvasNodesController } from './map-canvas-nodes.controller';
import { MapCanvasNodesService } from './map-canvas-nodes.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MapCanvasNodesController],
  providers: [MapCanvasNodesService],
  exports: [MapCanvasNodesService]
})
export class MapCanvasNodesModule {}
