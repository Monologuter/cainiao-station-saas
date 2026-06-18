import { describe, expect, it, vi } from 'vitest';
import { http } from './http';
import {
  confirmInboundOcrApi,
  recognizeInboundOcrApi,
  recognizeInboundOcrBatchApi,
} from './inbound';

describe('inbound api helpers', () => {
  it('posts OCR recognition as multipart form data', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({});
    const file = new File(['waybill'], 'waybill.jpg', { type: 'image/jpeg' });

    await recognizeInboundOcrApi(file, 'station-1');

    expect(post).toHaveBeenCalledWith('/inbound/ocr/recognize', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const formData = post.mock.calls[0]?.[1] as FormData;
    expect(formData.get('image')).toBe(file);
    expect(formData.get('stationId')).toBe('station-1');
  });

  it('confirms OCR recognition into inbound parcel', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({});

    await confirmInboundOcrApi({
      recognitionId: 'ocr-1',
      waybillNo: 'YT123456',
      courierCode: 'YTO',
      phone: '13800000000',
    });

    expect(post).toHaveBeenCalledWith('/inbound/ocr/confirm', {
      recognitionId: 'ocr-1',
      waybillNo: 'YT123456',
      courierCode: 'YTO',
      phone: '13800000000',
    });
  });

  it('posts OCR batch recognition as multipart form data', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({});
    const files = [
      new File(['waybill-1'], 'waybill-1.jpg', { type: 'image/jpeg' }),
      new File(['waybill-2'], 'waybill-2.jpg', { type: 'image/jpeg' }),
    ];

    await recognizeInboundOcrBatchApi(files, 'station-1');

    expect(post).toHaveBeenCalledWith('/inbound/ocr/recognize-batch', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const formData = post.mock.calls[0]?.[1] as FormData;
    expect(formData.getAll('images')).toEqual(files);
    expect(formData.get('stationId')).toBe('station-1');
  });
});
