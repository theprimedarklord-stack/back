import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import * as crypto from 'crypto';

@Injectable()
export class DeviceService {
  constructor(private db: DatabaseService) {}

  /** Mark a device as online and update last_seen_at. */
  async markOnline(deviceId: string) {
    await this.db.query(
      `UPDATE rt_devices SET status = 'online', last_seen_at = NOW() WHERE id = $1`,
      [deviceId],
    );
  }

  /** Mark a device as offline and update last_seen_at. */
  async markOffline(deviceId: string) {
    await this.db.query(
      `UPDATE rt_devices SET status = 'offline', last_seen_at = NOW() WHERE id = $1`,
      [deviceId],
    );
  }

  /** List all devices belonging to a user. */
  async listDevices(userId: string) {
    const res = await this.db.query(
      `SELECT id, user_id, name, fingerprint, os_info, supported_runtimes,
              last_seen_at, status, created_at
       FROM rt_devices
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return res.rows;
  }

  /** Delete a device (hard delete). Only the owning user can delete. */
  async deleteDevice(deviceId: string, userId: string) {
    const res = await this.db.query(
      `DELETE FROM rt_devices WHERE id = $1 AND user_id = $2`,
      [deviceId, userId],
    );
    if (res.rowCount === 0) {
      throw new NotFoundException('Device not found or not owned by user');
    }
  }

  /**
   * Revoke the current device key and generate a new one.
   * Returns the new plain-text key (shown to the user once).
   */
  async revokeKey(deviceId: string, userId: string): Promise<{ deviceKey: string }> {
    // Verify ownership first
    const check = await this.db.query(
      `SELECT id FROM rt_devices WHERE id = $1 AND user_id = $2`,
      [deviceId, userId],
    );
    if (check.rows.length === 0) {
      throw new NotFoundException('Device not found or not owned by user');
    }

    const newKey = crypto.randomBytes(32).toString('hex');
    const newHash = crypto.createHash('sha256').update(newKey).digest('hex');

    await this.db.query(
      `UPDATE rt_devices
       SET device_key_hash = $1, status = 'offline', last_seen_at = NOW()
       WHERE id = $2`,
      [newHash, deviceId],
    );

    return { deviceKey: newKey };
  }
}
