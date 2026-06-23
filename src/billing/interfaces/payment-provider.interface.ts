import { Request } from 'express';

export interface InvoiceData {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
}

export interface PaymentProvider {
  /**
   * The name of the provider (e.g. 'paddle', 'stripe')
   */
  getProviderName(): string;

  /**
   * Ensure a customer exists in the payment provider and return their ID.
   */
  ensureCustomer(orgId: string, orgName: string, ownerEmail?: string): Promise<string | null>;

  /**
   * Get a list of invoices/transactions for a customer.
   */
  getInvoices(customerId: string): Promise<InvoiceData[]>;

  /**
   * Verify the webhook signature from the incoming request.
   * Throws an error if invalid. Returns the parsed event.
   */
  verifyWebhookSignature(req: Request): Promise<any>;

  /**
   * Handle the parsed webhook event.
   * This method should map the provider-specific event to your business logic
   * (e.g., updating subscriptions in the DB).
   */
  handleWebhookEvent(event: any): Promise<void>;

  /**
   * Cancel an active subscription.
   */
  cancelSubscription(orgId: string): Promise<boolean>;

  /**
   * Create an update transaction for upgrading/downgrading.
   */
  getUpdateTransaction(orgId: string, newPriceId: string): Promise<string | null>;

  /**
   * Create a customer portal session URL.
   */
  getCustomerPortalSession(orgId: string): Promise<string | null>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
