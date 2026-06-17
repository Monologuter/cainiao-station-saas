import { describe, expect, it } from 'vitest';
import {
  complaintStatusLabel,
  pendingReviewTargetLabel,
  reviewRatingText,
} from './review';

describe('review api helpers', () => {
  it('maps review rating to compact mobile copy', () => {
    expect(reviewRatingText(5)).toBe('非常满意');
    expect(reviewRatingText(3)).toBe('一般');
  });

  it('maps complaint status progress', () => {
    expect(complaintStatusLabel('PENDING')).toBe('待处理');
    expect(complaintStatusLabel('RESOLVED')).toBe('已解决');
  });

  it('formats pending review targets', () => {
    expect(
      pendingReviewTargetLabel({
        targetType: 'PICKUP',
        refId: 'P001',
        stationName: '城南驿站',
      }),
    ).toBe('取件 · 城南驿站 · P001');
  });
});
