import { mapOcrResult } from './ocr-result.mapper';

describe('mapOcrResult', () => {
  it('marks high confidence OCR as recognized without review', () => {
    const mapped = mapOcrResult({
      provider: 'mock',
      fields: {
        waybillNo: { value: 'SF1234567890123', confidence: 0.93 },
        phoneTail: { value: '8765', confidence: 0.88 },
        courier: { value: 'SF', raw: '顺丰速运', confidence: 0.81 },
      },
      overallConfidence: 0.87,
      latencyMs: 10,
      warnings: [],
    });

    expect(mapped).toMatchObject({
      status: 'RECOGNIZED',
      needReview: false,
      waybillNo: 'SF1234567890123',
      phoneTail: '8765',
      courierCode: 'SF',
    });
  });

  it('marks medium confidence fields as requiring review', () => {
    const mapped = mapOcrResult({
      provider: 'mock',
      fields: {
        waybillNo: { value: 'YTO9876543210', confidence: 0.72 },
        phoneTail: { value: '4321', confidence: 0.61 },
        courier: { value: 'YTO', raw: '圆通', confidence: 0.7 },
      },
      overallConfidence: 0.7,
      latencyMs: 11,
      warnings: [],
    });

    expect(mapped.status).toBe('LOW_CONFIDENCE');
    expect(mapped.needReview).toBe(true);
    expect(mapped.reviewFields).toEqual(['waybillNo', 'phoneTail', 'courier']);
  });

  it('marks missing waybill or failed OCR as failed/manual review', () => {
    expect(
      mapOcrResult({
        provider: 'mock',
        fields: {},
        overallConfidence: 0,
        latencyMs: 5,
        warnings: ['unreadable'],
        errorCode: 'UNREADABLE',
      }),
    ).toMatchObject({
      status: 'FAILED',
      needReview: true,
      waybillNo: null,
      errorCode: 'UNREADABLE',
    });
  });
});
