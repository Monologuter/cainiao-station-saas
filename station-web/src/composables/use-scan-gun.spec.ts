import { describe, expect, it, vi } from 'vitest';
import { createScanBuffer } from './use-scan-gun';

describe('scan gun buffer', () => {
  it('emits one scan when quick keystrokes end with Enter', () => {
    const onScan = vi.fn();
    const scanner = createScanBuffer({ onScan, thresholdMs: 30 });

    scanner.handleKey({ key: 'Y', timeStamp: 0 });
    scanner.handleKey({ key: 'T', timeStamp: 10 });
    scanner.handleKey({ key: '1', timeStamp: 20 });
    scanner.handleKey({ key: 'Enter', timeStamp: 25 });

    expect(onScan).toHaveBeenCalledWith('YT1');
  });

  it('does not emit for slow manual typing', () => {
    const onScan = vi.fn();
    const scanner = createScanBuffer({ onScan, thresholdMs: 30 });

    scanner.handleKey({ key: 'Y', timeStamp: 0 });
    scanner.handleKey({ key: 'T', timeStamp: 120 });
    scanner.handleKey({ key: 'Enter', timeStamp: 300 });

    expect(onScan).not.toHaveBeenCalled();
  });
});
