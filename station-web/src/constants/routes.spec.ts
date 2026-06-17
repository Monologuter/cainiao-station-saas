import { describe, expect, it } from 'vitest';
import ExceptionsView from '@/views/ExceptionsView.vue';
import PlaceholderView from '@/views/PlaceholderView.vue';
import { availableRoutes, stationRouteDefs } from './routes';

describe('station route definitions', () => {
  it('exposes shipping route only with shipping:read permission', () => {
    expect(availableRoutes([]).map((route) => route.code)).not.toContain('shipping');
    expect(availableRoutes(['shipping:read']).map((route) => route.code)).toContain('shipping');
  });

  it('uses a real shipping management view instead of the placeholder', () => {
    expect(stationRouteDefs.find((route) => route.code === 'shipping')?.component).not.toBe(
      PlaceholderView,
    );
  });

  it('exposes exceptions route only with exception:read permission', () => {
    expect(availableRoutes([]).map((route) => route.code)).not.toContain('exceptions');
    expect(availableRoutes(['exception:read']).map((route) => route.code)).toContain(
      'exceptions',
    );
    expect(stationRouteDefs.find((route) => route.code === 'exceptions')?.component).toBe(
      ExceptionsView,
    );
  });
});
