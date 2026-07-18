import { Controller, Post, Get, Delete, Param, Body, Req, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { PairingService } from './pairing.service';
import { DeviceService } from './device.service';
import { RuntimeService } from '../runtime.service';
import { Public } from '../../common/decorators/public.decorator';
import { RequireOrg } from '../../common/decorators/require-org.decorator';
import { Throttle } from '@nestjs/throttler';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { CognitoAuthGuard } from '../../auth/cognito-auth.guard';

@Controller('runtime')
@UseGuards(CognitoAuthGuard)
@RequireOrg(false)
export class DeviceController {
  constructor(
    private pairingService: PairingService,
    private deviceService: DeviceService,
    private runtimeService: RuntimeService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ─── Helper ───────────────────────────────────────────────────────────────

  private getUserId(req: any): string {
    const userId = req.user?.userId || req.user?.id || req.user?.sub || req.headers['x-user-id'];
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new UnauthorizedException('User ID is missing or invalid');
    }
    return userId.trim();
  }

  // ─── Pairing ──────────────────────────────────────────────────────────────

  @Post('pairing/generate')
  async generateOtp(@Req() req: any) {
    const userId = this.getUserId(req);
    const otp = await this.pairingService.generateOtp(userId);
    return { otp, expiresIn: 300 };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @Post('pairing/confirm')
  async confirmPairing(
    @Body() body: { otp: string; name: string; osInfo: object; capabilities: string[] },
  ) {
    return this.pairingService.confirmPairing(
      body.otp,
      body.name || 'Unknown PC',
      body.osInfo || {},
      body.capabilities || [],
    );
  }

  // ─── Devices ──────────────────────────────────────────────────────────────

  /** GET /runtime/devices — list all devices for the current user. */
  @Get('devices')
  async listDevices(@Req() req: any) {
    const userId = this.getUserId(req);
    return this.deviceService.listDevices(userId);
  }

  /** DELETE /runtime/devices/:id — delete a device. */
  @Delete('devices/:id')
  async deleteDevice(@Param('id') deviceId: string, @Req() req: any) {
    const userId = this.getUserId(req);
    await this.deviceService.deleteDevice(deviceId, userId);
    return { success: true };
  }

  /** POST /runtime/devices/:id/revoke — revoke device key and regenerate. */
  @Post('devices/:id/revoke')
  async revokeDevice(@Param('id') deviceId: string, @Req() req: any) {
    const userId = this.getUserId(req);
    return this.deviceService.revokeKey(deviceId, userId);
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  @Get('sessions')
  async listSessions(@Req() req: any, @Query('mapCardId') mapCardId?: string) {
    const userId = this.getUserId(req);
    if (mapCardId) {
      return this.runtimeService.listSessionsByMapCard(parseInt(mapCardId, 10), userId);
    }
    return this.runtimeService.listSessions(userId, 'active');
  }

  /** POST /runtime/sessions/:id/pause — pause a session. */
  @Post('sessions/:id/pause')
  async pauseSession(@Param('id') sessionId: string, @Req() req: any) {
    const userId = this.getUserId(req);
    return this.runtimeService.pauseSession(sessionId, userId);
  }

  /** POST /runtime/sessions/:id/resume — resume a session. */
  @Post('sessions/:id/resume')
  async resumeSession(@Param('id') sessionId: string, @Req() req: any) {
    const userId = this.getUserId(req);
    this.eventEmitter.emit('runtime.resume_requested', { sessionId, userId });
    return { status: 'resuming' };
  }

  /** DELETE /runtime/sessions/:id — terminate a session. */
  @Delete('sessions/:id')
  async terminateSession(@Param('id') sessionId: string, @Req() req: any) {
    const userId = this.getUserId(req);
    const session = await this.runtimeService.terminateSession(sessionId, userId);
    this.eventEmitter.emit('runtime.terminate_requested', {
      sessionId,
      deviceId: session.device_id,
    });
    return session;
  }
}
