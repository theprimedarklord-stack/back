import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { LimitsService } from './limits.service';
import { BillingController } from './billing.controller';
import { PaymentWebhookController } from './payment-webhook.controller';
import { LimitsGuard } from './guards/limits.guard';
import { SupabaseModule } from '../supabase/supabase.module';
import { SupabaseService } from '../supabase/supabase.service';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { PaddleProvider } from './providers/paddle.provider';

@Module({
  imports: [ConfigModule, SupabaseModule],
  controllers: [BillingController, PaymentWebhookController],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, SupabaseService, LimitsService],
      useFactory: (
        configService: ConfigService,
        supabaseService: SupabaseService,
        limitsService: LimitsService,
      ) => {
        // In the future, you can check process.env.PAYMENT_PROVIDER here
        // e.g., if (configService.get('PAYMENT_PROVIDER') === 'stripe') return new StripeProvider(...)
        return new PaddleProvider(configService, supabaseService, limitsService);
      },
    },
    BillingService,
    LimitsService,
    LimitsGuard,
  ],
  exports: [LimitsService, LimitsGuard],
})
export class BillingModule {}
