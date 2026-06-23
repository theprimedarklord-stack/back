import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment, LogLevel, Paddle } from '@paddle/paddle-node-sdk';
import { Request } from 'express';
import { PaymentProvider, InvoiceData } from '../interfaces/payment-provider.interface';
import { SupabaseService } from '../../supabase/supabase.service';
import { LimitsService } from '../limits.service';

@Injectable()
export class PaddleProvider implements PaymentProvider {
  private readonly paddle: Paddle;
  private readonly logger = new Logger(PaddleProvider.name);

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private limitsService: LimitsService,
  ) {
    const apiKey = this.configService.get<string>('PADDLE_API_KEY');
    const isProd = this.configService.get<string>('APP_ENV') === 'prod';
    
    if (!apiKey) {
      this.logger.warn('PADDLE_API_KEY is not configured');
    }
    
    this.paddle = new Paddle(apiKey || 'mock_key', {
      environment: isProd ? Environment.production : Environment.sandbox,
      logLevel: LogLevel.warn,
    });
  }

  getProviderName(): string {
    return 'paddle';
  }

  async ensureCustomer(orgId: string, orgName: string, ownerEmail?: string): Promise<string | null> {
    const adminClient = this.supabaseService.getAdminClient() as any;

    const { data: subData } = await adminClient
      .from('org_subscriptions')
      .select('billing_customer_id')
      .eq('org_id', orgId)
      .single();

    if (subData?.billing_customer_id) {
      return subData.billing_customer_id;
    }

    // Usually Paddle Checkout handles customer creation on the frontend.
    return null;
  }

  async getInvoices(customerId: string): Promise<InvoiceData[]> {
    const transactions = await this.paddle.transactions.list({ customerId: [customerId] });
    const invoices: InvoiceData[] = [];
    
    for await (const t of transactions) {
      if (t.status === 'completed' || t.status === 'paid') {
        const amount = t.details?.totals?.grandTotal ? parseInt(t.details.totals.grandTotal, 10) / 100 : 0;
        invoices.push({
          id: t.id,
          date: new Date(t.createdAt).toLocaleDateString('uk-UA'),
          amount: amount,
          currency: t.currencyCode,
          status: 'Оплачено',
          pdfUrl: null,
        });
      }
    }
    return invoices;
  }

  async verifyWebhookSignature(req: Request): Promise<any> {
    const signature = req.headers['paddle-signature'] as string || '';
    const secretKey = this.configService.get<string>('PADDLE_WEBHOOK_SECRET') || '';
    const rawBody = (req as any).rawBody ? (req as any).rawBody.toString() : '';

    try {
      if (signature && secretKey) {
        return this.paddle.webhooks.unmarshal(rawBody, secretKey, signature);
      } else {
        throw new Error('Missing signature or secret');
      }
    } catch (e: any) {
      this.logger.error(`Webhook signature verification failed: ${e.message}`);
      throw new BadRequestException(`Webhook Error: ${e.message}`);
    }
  }

  async handleWebhookEvent(event: any): Promise<void> {
    const adminClient = this.supabaseService.getAdminClient() as any;
    const eventType = event.eventType;
    const data = event.data;
    const orgId = data.customData?.orgId;

    if (!orgId) {
      this.logger.warn(`No orgId in customData for event ${eventType}`);
      return;
    }

    switch (eventType) {
      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.activated':
      case 'subscription.resumed': {
        const customerId = data.customerId;
        const subscriptionId = data.id;
        
        const items = data.items || [];
        const priceId = items.length > 0 ? items[0].price.id : null;

        const proPriceId = this.configService.get<string>('PADDLE_PRO_PRICE_ID');
        const entPriceId = this.configService.get<string>('PADDLE_ENTERPRISE_PRICE_ID');
        
        let plan = 'free';
        if (priceId === proPriceId) plan = 'pro';
        if (priceId === entPriceId) plan = 'enterprise';

        await adminClient
          .from('org_subscriptions')
          .update({
            billing_provider: this.getProviderName(),
            billing_customer_id: customerId,
            billing_subscription_id: subscriptionId,
            billing_price_id: priceId,
            plan,
            status: data.status,
            current_period_end: data.currentBillingPeriod?.endsAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', orgId);

        await this.applyPlanLimits(orgId, plan);
        break;
      }

      case 'subscription.canceled': {
        await adminClient
          .from('org_subscriptions')
          .update({
            plan: 'free',
            status: 'canceled',
            billing_subscription_id: null,
            billing_price_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', orgId);

        await this.applyPlanLimits(orgId, 'free');
        break;
      }

      case 'transaction.paid': {
        const subscriptionId = data.subscriptionId;
        if (!subscriptionId) break;

        const { data: subData } = await adminClient
          .from('org_subscriptions')
          .select('org_id')
          .eq('billing_subscription_id', subscriptionId)
          .single();

        if (subData) {
          await adminClient
            .from('org_usage')
            .update({
              used_api_requests: 0,
              used_ai_requests: 0,
              period_start: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('org_id', subData.org_id);

          await this.limitsService.invalidateCache(subData.org_id);
        }
        break;
      }
    }
  }

  private async applyPlanLimits(orgId: string, plan: string) {
    const adminClient = this.supabaseService.getAdminClient() as any;
    
    let limits = {
      max_projects: 3, max_members: 5, max_cards: 500, max_nodes: 300,
      max_storage_mb: 500, max_api_requests: 5000, max_ai_requests: 100,
      ai_access_enabled: true, blockchain_enabled: false, rust_agent_enabled: false
    };

    if (plan === 'pro') {
      limits = {
        max_projects: 25, max_members: 50, max_cards: 10000, max_nodes: 5000,
        max_storage_mb: 10240, max_api_requests: 50000, max_ai_requests: 5000,
        ai_access_enabled: true, blockchain_enabled: false, rust_agent_enabled: false
      };
    } else if (plan === 'enterprise') {
      limits = {
        max_projects: 999999, max_members: 999999, max_cards: 999999, max_nodes: 999999,
        max_storage_mb: 102400, max_api_requests: 500000, max_ai_requests: 50000,
        ai_access_enabled: true, blockchain_enabled: false, rust_agent_enabled: false
      };
    }

    await adminClient.from('org_limits').update(limits).eq('org_id', orgId);
    await this.limitsService.invalidateCache(orgId);
  }
}
