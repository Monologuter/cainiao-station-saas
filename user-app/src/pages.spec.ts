import { describe, expect, it } from 'vitest';
import pagesJson from '../pages.json';

describe('user-app pages', () => {
  it('registers online shipping and tracking pages', () => {
    const paths = pagesJson.pages.map((page) => page.path);

    expect(paths).toContain('pages/ship/index');
    expect(paths).toContain('pages/ship-orders/index');
    expect(paths).toContain('pages/tracking/index');
  });
});
