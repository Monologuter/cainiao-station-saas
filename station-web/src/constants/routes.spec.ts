import { describe, expect, it } from 'vitest';
import { availableRoutes } from './routes';

describe('station route definitions', () => {
  it('exposes shipping route only with shipping:read permission', () => {
    expect(availableRoutes([]).map((route) => route.code)).not.toContain('shipping');
    expect(availableRoutes(['shipping:read']).map((route) => route.code)).toContain('shipping');
  });
});
