import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { MoneyValidationError, CurrencyMismatchError } from '../../../domain/value-objects/money.vo';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const responseBody = exception.getResponse();

      this.logger.warn(
        { path: request.url, status, exception: exception.message },
        'HTTP exception',
      );

      response.status(status).send(
        typeof responseBody === 'object'
          ? responseBody
          : { message: responseBody, error: 'Error' },
      );
      return;
    }

    if (exception instanceof MoneyValidationError || exception instanceof CurrencyMismatchError) {
      this.logger.warn({ path: request.url, message: exception.message }, 'Money validation error');
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).send({
        message: exception.message,
        error: 'ValidationError',
        failureCode: 'INVALID_MONEY',
      });
      return;
    }

    this.logger.error({ path: request.url, exception }, 'Unhandled exception');
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      message: 'Internal server error',
      error: 'InternalServerError',
    });
  }
}
