import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Фильтр для маскировки ошибок парсинга JSON
 * Превращает все ошибки парсинга в единообразный 401 Unauthorized
 */
@Catch()
export class TelemetryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Только для эндпоинта телеметрии
    if (!request.path.includes('/api/v1/telemetry')) {
      // Для других путей используем стандартную обработку
      if (exception instanceof HttpException) {
        response.status(exception.getStatus()).json(exception.getResponse());
      } else {
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          status: 'error',
          message: 'Internal server error',
        });
      }
      return;
    }

    // Для телеметрии - все ошибки превращаем в 401 Unauthorized
    // НЕ логируем детали ошибок (только факт провала)
    response.status(HttpStatus.UNAUTHORIZED).json({
      status: 'error',
      message: 'Unauthorized',
    });
  }
}
