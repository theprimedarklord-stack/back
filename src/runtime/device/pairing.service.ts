import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { CACHE_REDIS_CLIENT } from '../../common/redis/cache-redis.module';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { DatabaseService } from '../../db/database.service';

@Injectable()
export class PairingService {
  constructor(
    @Inject(CACHE_REDIS_CLIENT) private redis: Redis,
    private db: DatabaseService,
  ) {}

  async generateOtp(userId: string): Promise<string> {
    const otp = crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{1,4}/g)?.join('-') || 'ERR-OTP';
    await this.redis.set(`pairing:otp:${otp}`, userId, 'EX', 300);
    return otp;
  }

  async confirmPairing(otp: string, deviceName: string, osInfo: object, capabilities: string[]): Promise<{ deviceKey: string; deviceId: string }> {
    const userId = await this.redis.get(`pairing:otp:${otp}`);
    if (!userId) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const deviceKey = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(deviceKey).digest('hex');

    const res = await this.db.query(
      `INSERT INTO rt_devices (user_id, name, device_key_hash, os_info, supported_runtimes, status) 
       VALUES ($1, $2, $3, $4, $5, 'online') RETURNING id`,
      [userId, deviceName, JSON.stringify(osInfo), capabilities]
    );

    await this.redis.del(`pairing:otp:${otp}`);

    return { deviceKey, deviceId: res.rows[0].id };
  }
}
