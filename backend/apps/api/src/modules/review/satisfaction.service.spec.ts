import { SatisfactionService } from './satisfaction.service';

describe('SatisfactionService', () => {
  it('summarizes average rating, distribution and complaint rate', async () => {
    const tx = {
      review: {
        findMany: jest.fn().mockResolvedValue([
          { rating: 5, createdAt: new Date('2026-06-01T08:00:00.000Z') },
          { rating: 4, createdAt: new Date('2026-06-01T09:00:00.000Z') },
          { rating: 1, createdAt: new Date('2026-06-02T09:00:00.000Z') },
        ]),
      },
      complaint: {
        count: jest.fn().mockResolvedValue(1),
      },
      parcel: {
        count: jest.fn().mockResolvedValue(10),
      },
    };
    const service = new SatisfactionService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    const out = await service.summary('tenant-1', {
      stationId: 'station-1',
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(out).toEqual({
      avgRating: 3.33,
      reviewCount: 3,
      ratingDist: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 1 },
      complaintCount: 1,
      pickupCount: 10,
      complaintRate: 0.1,
      trend: [
        { date: '2026-06-01', avgRating: 4.5, reviewCount: 2 },
        { date: '2026-06-02', avgRating: 1, reviewCount: 1 },
      ],
    });
  });
});
