import { describe, expect, it } from 'vitest';
import { formatPickupCode } from './parcel';

describe('consumer parcel helpers', () => {
  it('formats pickup code for large mobile display', () => {
    expect(formatPickupCode('12345678')).toBe('1234 5678');
    expect(formatPickupCode('8-2-1043')).toBe('8-2-1043');
  });
});
