import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Wake-up endpoint для Render.
   * Помечен @Public() — не требует Service Token или Cognito JWT.
   */
  @Get()
  @Public()
  getHello(): string {
    return 'SmartMemory API is online';
  }

  /**
   * Health-check endpoint для Render.
   * Помечен @Public() — не требует Service Token или Cognito JWT.
   */
  @Get('health')
  @Public()
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
