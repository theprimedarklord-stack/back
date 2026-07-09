import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  Query,
  UseGuards,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException
} from '@nestjs/common';
import { PublicSharesService } from './public-shares.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('public-shares')
export class PublicSharesController {
  constructor(private readonly publicSharesService: PublicSharesService) {}

  // ---------------------------------------------------------------------------
  // AUTHENTICATED ROUTES (for the map card owner to publish/unpublish)
  // ---------------------------------------------------------------------------

  @Post()
  @UseGuards(CognitoAuthGuard)
  async publish(
    @Req() req: AuthenticatedRequest,
    @Body() body: { map_card_id: number; node_id?: string; permission?: string }
  ) {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.publicSharesService.publish(
      req.user.userId,
      orgId,
      body.map_card_id,
      body.node_id,
      body.permission || 'view'
    );
  }

  @Patch(':id')
  @UseGuards(CognitoAuthGuard)
  async unpublish(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { is_active: boolean }
  ) {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.publicSharesService.updateStatus(req.user.userId, orgId, id, body.is_active);
  }

  @Get()
  @UseGuards(CognitoAuthGuard)
  async listShares(
    @Req() req: AuthenticatedRequest,
    @Query('map_card_id') mapCardId: string
  ) {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    if (!mapCardId) {
      throw new BadRequestException('map_card_id query parameter is required');
    }

    return this.publicSharesService.getSharesForMapCard(orgId, Number(mapCardId));
  }
}

// Separate controller for public unauthenticated access
@Controller('public')
export class PublicAccessController {
  constructor(private readonly publicSharesService: PublicSharesService) {}

  @Get('map-card/:slug')
  async getPublicMapCard(@Param('slug') slug: string) {
    const data = await this.publicSharesService.getPublicMapCard(slug);
    if (!data) throw new NotFoundException('Map card not found or not published');
    return data;
  }

  @Get('node/:slug')
  async getPublicNode(@Param('slug') slug: string) {
    const data = await this.publicSharesService.getPublicNode(slug);
    if (!data) throw new NotFoundException('Node not found or not published');
    return data;
  }
}
