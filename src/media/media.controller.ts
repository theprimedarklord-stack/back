import { Controller, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('media')
@UseGuards(CognitoAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-url')
  async generateUploadUrl(
    @Body() dto: GenerateUploadUrlDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const orgId = req.headers['x-org-id'];
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    return this.mediaService.generateSignedUploadUrl(orgId as string, req.user.userId, dto);
  }
}
