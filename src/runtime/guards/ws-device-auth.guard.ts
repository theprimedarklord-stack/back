import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../db/database.service';
import { DeviceService } from '../device/device.service';

/**
 * WebSocket authentication guard for device (agent) connections.
 * Validates the device key passed via the WS handshake query parameter `?deviceKey=...`.
 *
 * The device key is hashed (SHA-256) and compared against `devices.device_key_hash`.
 * On success, attaches `client.deviceId` and `client.userId` to the WebSocket instance.
 */
@Injectable()
export class WsDeviceAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsDeviceAuthGuard.name);

  constructor(
    private db: DatabaseService,
    private deviceService: DeviceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const request = context.switchToHttp().getRequest();

    let deviceKey: string | undefined;
    if (request?.url) {
      const url = new URL(request.url, 'http://localhost');
      deviceKey = url.searchParams.get('deviceKey') || undefined;
    }

    if (!deviceKey) {
      this.logger.warn('WsDeviceAuthGuard: No deviceKey in WS handshake');
      client.close?.(4001, 'Unauthorized: No device key');
      return false;
    }

    try {
      const hash = crypto.createHash('sha256').update(deviceKey).digest('hex');
      const res = await this.db.query(
        `SELECT id, user_id, status FROM devices WHERE device_key_hash = $1`,
        [hash],
      );

      if (res.rows.length === 0) {
        this.logger.warn('WsDeviceAuthGuard: Unknown device key');
        client.close?.(4001, 'Unauthorized: Unknown device');
        return false;
      }

      const device = res.rows[0];
      if (device.status === 'revoked') {
        this.logger.warn(`WsDeviceAuthGuard: Device ${device.id} has been revoked`);
        client.close?.(4003, 'Device revoked');
        return false;
      }

      client.deviceId = device.id;
      client.userId = device.user_id;

      // Update last_seen_at
      await this.deviceService.markOnline(device.id);

      return true;
    } catch (err) {
      this.logger.error(`WsDeviceAuthGuard: Verification failed — ${err.message}`);
      client.close?.(4001, 'Unauthorized: Verification error');
      return false;
    }
  }
}
