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
}
