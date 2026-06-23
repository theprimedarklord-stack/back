import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './interfaces/payment-provider.interface';
import { LimitsService } from './limits.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private supabaseService: SupabaseService,
    @Inject(PAYMENT_PROVIDER) private paymentProvider: PaymentProvider,
    private limitsService: LimitsService,
  ) {}

  async getBillingInfo(orgId: string) {
    const adminClient = this.supabaseService.getAdminClient() as any;

    const { data: subData } = await adminClient
      .from('org_subscriptions')
      .select('*')
      .eq('org_id', orgId)
      .single();

    const limitsData = await this.limitsService.getLimitsAndUsage(orgId);

    let invoices: any[] = [];
    if (subData?.billing_customer_id) {
      try {
        invoices = await this.paymentProvider.getInvoices(subData.billing_customer_id);
      } catch (e) {
        this.logger.warn(`Failed to fetch invoices for org ${orgId}`, e);
      }
    }

    return {
      subscription: {
        plan: subData?.plan || 'free',
        status: subData?.status || 'active',
        currentPeriodEnd: subData?.current_period_end,
        cancelAtPeriodEnd: subData?.cancel_at_period_end || false,
      },
      limits: limitsData?.limits || {},
      usage: limitsData?.usage || {},
      invoices,
    };
  }

  async ensureBillingCustomer(orgId: string, orgName: string, ownerEmail?: string): Promise<string | null> {
    return this.paymentProvider.ensureCustomer(orgId, orgName, ownerEmail);
  }

  async cancelSubscription(orgId: string): Promise<boolean> {
    return this.paymentProvider.cancelSubscription(orgId);
  }

  async getUpdateTransaction(orgId: string, newPriceId: string): Promise<string | null> {
    return this.paymentProvider.getUpdateTransaction(orgId, newPriceId);
  }

  async getCustomerPortalSession(orgId: string): Promise<string | null> {
    return this.paymentProvider.getCustomerPortalSession(orgId);
  }
}
