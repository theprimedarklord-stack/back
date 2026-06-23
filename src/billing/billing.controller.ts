import { Controller, Get, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequireOrg } from '../common/decorators/require-org.decorator';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { BillingService } from './billing.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('billing')
@UseGuards(CognitoAuthGuard)
export class BillingController {
  constructor(
    private billingService: BillingService,
    private configService: ConfigService,
  ) {}

  @Get('info')
  @RequireOrg(true)
  async getInfo(@Req() req: AuthenticatedRequest) {
    const orgId = req.headers['x-org-id'] as string;
    return this.billingService.getBillingInfo(orgId);
  }

  @Get('customer')
  @RequireOrg(true)
  async getCustomer(@Req() req: AuthenticatedRequest) {
    const orgId = req.headers['x-org-id'] as string;
    const customerId = await this.billingService.ensureBillingCustomer(orgId, `Org ${orgId}`, req.user.email);
    return { customerId };
  }

  @Post('cancel')
  @RequireOrg(true)
  async cancelSubscription(@Req() req: AuthenticatedRequest) {
    const orgId = req.headers['x-org-id'] as string;
    const success = await this.billingService.cancelSubscription(orgId);
    if (!success) {
      throw new BadRequestException('Failed to cancel subscription');
    }
    return { success: true };
  }

  @Post('update-transaction')
  @RequireOrg(true)
  async updateTransaction(
    @Req() req: AuthenticatedRequest,
    @Body('priceId') priceId: string,
  ) {
    const orgId = req.headers['x-org-id'] as string;
    if (!priceId) {
      throw new BadRequestException('priceId is required');
    }
    const transactionId = await this.billingService.getUpdateTransaction(orgId, priceId);
    if (!transactionId) {
      throw new BadRequestException('Failed to create update transaction');
    }
    return { transactionId };
  }

  @Get('customer-portal')
  @RequireOrg(true)
  async getCustomerPortal(@Req() req: AuthenticatedRequest) {
    const orgId = req.headers['x-org-id'] as string;
    const url = await this.billingService.getCustomerPortalSession(orgId);
    if (!url) {
      throw new BadRequestException('Failed to create customer portal session');
    }
    return { url };
  }
}
