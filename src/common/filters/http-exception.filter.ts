// src/common/filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ValidationError } from 'class-validator';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] | object = 'Внутренняя ошибка сервера';

    if (exception instanceof HttpException && exception.getStatus() === HttpStatus.BAD_REQUEST) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null && 'message' in exceptionResponse) {
        // Приводим тип message к string | string[], так как ValidationPipe возвращает массив строк или строку
        message = exceptionResponse.message as string | string[];
        status = HttpStatus.BAD_REQUEST;
      } else {
        message = exceptionResponse || 'Bad Request';
        status = HttpStatus.BAD_REQUEST;
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    console.error('=== EXCEPTION FILTER DEBUG ===');
    console.error('Exception type:', exception?.constructor?.name || 'Unknown');
    console.error('Exception message:', exception instanceof Error ? exception.message : 'Unknown error');
    console.error('Exception stack:', exception instanceof Error ? exception.stack : 'No stack');
    console.error('Full exception:', exception);
    console.error('================================');

    response.status(status).json({
      success: false,
      error: message,
      status,
      timestamp: new Date().toISOString(),
    });
  }
}