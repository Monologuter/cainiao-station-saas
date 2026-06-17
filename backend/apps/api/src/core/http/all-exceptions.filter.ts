import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiCode, BizError } from './api-code';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: number = ApiCode.INTERNAL;
    let message = 'internal error';

    if (exception instanceof BizError) {
      status = HttpStatus.OK;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status;
      const response = exception.getResponse() as
        | string
        | { message?: string | string[] };
      message =
        typeof response === 'string'
          ? response
          : Array.isArray(response.message)
            ? response.message.join('; ')
            : (response.message ?? exception.message);
    }

    res.status(status).json({ code, message, data: null });
  }
}
