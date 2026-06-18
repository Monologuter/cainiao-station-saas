import { describe, expect, it } from 'vitest';
import pagesJson from '../pages.json';

describe('user-app pages', () => {
  it('registers online shipping and tracking pages', () => {
    const paths = pagesJson.pages.map((page) => page.path);

    expect(paths).toContain('pages/ship/index');
    expect(paths).toContain('pages/ship-orders/index');
    expect(paths).toContain('pages/tracking/index');
    expect(paths).toContain('pages/member/index');
    expect(paths).toContain('pages/member/checkin');
    expect(paths).toContain('pages/member/coupons');
    expect(paths).toContain('pages/member/reviews');
    expect(paths).toContain('pages/member/complaints');
    expect(paths).toContain('pages/assistant/index');
  });

  it('registers messages, authorize and profile pages', () => {
    const paths = pagesJson.pages.map((page) => page.path);

    expect(paths).toContain('pages/messages/index');
    expect(paths).toContain('pages/authorize/index');
    expect(paths).toContain('pages/profile/index');
  });
});
