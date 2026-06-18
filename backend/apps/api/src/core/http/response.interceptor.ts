import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiCode } from './api-code';

export class RawResponse {
  constructor(public readonly body: string) {}
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(
        map((data) =>
          data instanceof RawResponse
            ? data.body
            : { code: ApiCode.OK, message: 'ok', data },
        ),
      );
  }
}
