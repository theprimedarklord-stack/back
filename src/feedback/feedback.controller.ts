import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RequireOrg } from '../common/decorators/require-org.decorator';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackService } from './feedback.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @Public()
  @RequireOrg(false)
  @Throttle({ default: { limit: 3, ttl: 60 * 60 * 1000 } })
  async submitFeedback(@Body() dto: CreateFeedbackDto, @Req() req: Request) {
    const userId = await this.feedbackService.resolveUserIdFromOptionalBearer(req);
    await this.feedbackService.createFeedback(dto, userId);
    return { success: true };
  }

  @Get()
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async getFeedbacks(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
  ) {
    await this.feedbackService.assertCanModerateFeedbacks(req.user);
    return this.feedbackService.listFeedbacks(status);
  }

  @Patch(':id/status')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateFeedbackStatusDto,
  ) {
    await this.feedbackService.assertCanModerateFeedbacks(req.user);
    await this.feedbackService.updateStatus(id, body.status);
    return { success: true };
  }
}
