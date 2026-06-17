import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  it('wraps payload into {code,message,data}', (done) => {
    const interceptor = new ResponseInterceptor();
    const next = { handle: () => of({ a: 1 }) } as any;

    interceptor.intercept({} as any, next).subscribe((res) => {
      expect(res).toEqual({ code: 0, message: 'ok', data: { a: 1 } });
      done();
    });
  });
});
