import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger as PinoLogger } from 'nestjs-pino';

type ErrorDetails = unknown;

const STATUS_CODE_TO_ERROR: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.resolveStatus(exception);
    const code = this.resolveErrorCode(status, exception);
    const payload = this.extractErrorPayload(exception);
    const isHttpException = exception instanceof HttpException;

    const shouldSanitize = status >= HttpStatus.INTERNAL_SERVER_ERROR && !isHttpException;
    const responseMessage = shouldSanitize
      ? 'Internal server error'
      : payload.message;
    const responseDetails = shouldSanitize ? null : payload.details;

    const responseBody = {
      error: {
        code,
        message: responseMessage,
        details:
          responseDetails ??
          (request.requestId ? { request_id: request.requestId } : null),
      },
    };

    const logMethod =
      status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? this.logger.error.bind(this.logger)
        : this.logger.warn.bind(this.logger);

    logMethod(
      {
        err: exception instanceof Error ? exception : undefined,
        statusCode: status,
        error_code: code,
        request_id: request.requestId,
        method: request.method,
        path: request.originalUrl ?? request.url,
      },
      payload.message,
    );

    response.status(status).json(responseBody);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveErrorCode(status: number, _exception: unknown): string {
    if (status === HttpStatus.BAD_REQUEST) {
      return 'VALIDATION_ERROR';
    }

    if (status === HttpStatus.UNPROCESSABLE_ENTITY) {
      return 'VALIDATION_ERROR';
    }

    if (STATUS_CODE_TO_ERROR[status]) {
      return STATUS_CODE_TO_ERROR[status];
    }

    if (status >= 500) {
      return 'INTERNAL_ERROR';
    }

    return 'REQUEST_INVALID';
  }

  private extractErrorPayload(exception: unknown): {
    message: string;
    details: ErrorDetails | null;
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { message: response, details: null };
      }

      if (typeof response === 'object' && response) {
        const res = response as Record<string, unknown>;
        const message = this.normalizeMessage(res);
        const details = this.normalizeDetails(res);
        return { message, details };
      }

      return { message: exception.message, details: null };
    }

    if (exception instanceof Error) {
      return { message: exception.message, details: null };
    }

    return { message: 'Internal server error', details: null };
  }

  private normalizeMessage(response: Record<string, unknown>): string {
    if (typeof response.message === 'string' && response.message.length > 0) {
      return response.message;
    }
    if (typeof response.error === 'string' && response.error.length > 0) {
      return response.error;
    }
    if (Array.isArray(response.message) && response.message.length > 0) {
      return 'Validation failed';
    }
    return 'Request failed';
  }

  private normalizeDetails(
    response: Record<string, unknown>,
  ): ErrorDetails | null {
    if (Array.isArray(response.message)) {
      return response.message;
    }

    if (response.details !== undefined) {
      return response.details;
    }

    return null;
  }
}
