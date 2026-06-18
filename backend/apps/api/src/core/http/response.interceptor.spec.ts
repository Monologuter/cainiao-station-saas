import { of } from 'rxjs';
import { RawResponse, ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  it('wraps payload into {code,message,data}', (done) => {
    const interceptor = new ResponseInterceptor();
    const next = { handle: () => of({ a: 1 }) } as any;

    interceptor.intercept({} as any, next).subscribe((res) => {
      expect(res).toEqual({ code: 0, message: 'ok', data: { a: 1 } });
      done();
    });
  });

  it('returns raw text responses without envelope wrapping', (done) => {
    const interceptor = new ResponseInterceptor();
    const next = { handle: () => of(new RawResponse('metric 1')) } as any;

    interceptor.intercept({} as any, next).subscribe((res) => {
      expect(res).toBe('metric 1');
      done();
    });
  });
});
