import { beforeEach, describe, expect, it } from 'vitest';
import { STATION_STORAGE_KEY, syncDefaultStationId } from './auth';

describe('auth station scope helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists the first visible station for tenant users', () => {
    expect(
      syncDefaultStationId({
        id: 'u1',
        username: 'boss',
        tenantId: 't1',
        roles: ['店长'],
        isPlatform: false,
        allStations: true,
        stations: ['s1', 's2'],
      }),
    ).toBe('s1');
    expect(localStorage.getItem(STATION_STORAGE_KEY)).toBe('s1');
  });

  it('keeps a valid selected station and replaces an invalid one', () => {
    localStorage.setItem(STATION_STORAGE_KEY, 's2');
    expect(
      syncDefaultStationId({
        id: 'u1',
        username: 'boss',
        tenantId: 't1',
        roles: ['店长'],
        isPlatform: false,
        stations: [{ id: 's1', name: '一店' }, { id: 's2', name: '二店' }],
      }),
    ).toBe('s2');

    localStorage.setItem(STATION_STORAGE_KEY, 'other');
    expect(
      syncDefaultStationId({
        id: 'u1',
        username: 'boss',
        tenantId: 't1',
        roles: ['店长'],
        isPlatform: false,
        stations: [{ id: 's1', name: '一店' }],
      }),
    ).toBe('s1');
  });

  it('clears station selection for platform users', () => {
    localStorage.setItem(STATION_STORAGE_KEY, 's1');
    expect(
      syncDefaultStationId({
        id: 'admin',
        username: 'admin',
        tenantId: null,
        roles: ['平台超管'],
        isPlatform: true,
        stations: ['s1'],
      }),
    ).toBeNull();
    expect(localStorage.getItem(STATION_STORAGE_KEY)).toBeNull();
  });
});
