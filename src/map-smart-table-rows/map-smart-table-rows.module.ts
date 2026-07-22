import { Module } from '@nestjs/common';
import { MapSmartTableRowsController } from './map-smart-table-rows.controller';
import { MapSmartTableRowsService } from './map-smart-table-rows.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MapSmartTableRowsController],
  providers: [MapSmartTableRowsService],
  exports: [MapSmartTableRowsService]
})
export class MapSmartTableRowsModule {}
