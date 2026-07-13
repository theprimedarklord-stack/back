import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';

@Injectable()
export class DeviceService {
  constructor(private db: DatabaseService) {}

  async markOnline(deviceId: string) {
    await this.db.query(
      `UPDATE rt_devices SET status = 'online', last_seen_at = NOW() WHERE id = $1`,
      [deviceId]
    );
  }

  async markOffline(deviceId: string) {
    await this.db.query(
      `UPDATE rt_devices SET status = 'offline', last_seen_at = NOW() WHERE id = $1`,
      [deviceId]
    );
  }
}
