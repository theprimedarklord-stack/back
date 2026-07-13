import { Controller, Post, Body, Req } from '@nestjs/common';
import { PairingService } from './pairing.service';

@Controller('runtime/pairing')
export class DeviceController {
  constructor(private pairingService: PairingService) {}

  @Post('generate')
  async generateOtp(@Req() req: any) {
    const userId = req.user?.sub || '00000000-0000-0000-0000-000000000000'; // Temporary mock UUID
    const otp = await this.pairingService.generateOtp(userId);
    return { otp, expiresIn: 300 };
  }

  @Post('confirm')
  async confirmPairing(@Body() body: { otp: string; name: string; osInfo: object; capabilities: string[] }) {
    return this.pairingService.confirmPairing(body.otp, body.name || 'Unknown PC', body.osInfo || {}, body.capabilities || []);
  }
}
