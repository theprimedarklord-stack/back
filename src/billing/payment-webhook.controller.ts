import { Controller, Post, Req, BadRequestException, Inject } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RequireOrg } from '../common/decorators/require-org.decorator';
import { PAYMENT_PROVIDER, PaymentProvider } from './interfaces/payment-provider.interface';

@Controller('billing/webhooks')
export class PaymentWebhookController {
  constructor(@Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider) {}

  @Post()
  @Public()
  @RequireOrg(false)
  async handleWebhook(@Req() req: Request) {
    try {
      // Delegate signature verification and parsing to the active provider
      const event = await this.paymentProvider.verifyWebhookSignature(req);
      
      // Handle the event
      await this.paymentProvider.handleWebhookEvent(event);
      
      return { received: true };
    } catch (err: any) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }
  }
}
