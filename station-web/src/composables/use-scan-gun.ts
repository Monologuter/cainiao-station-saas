import { onBeforeUnmount, onMounted } from 'vue';

interface KeyLike {
  key: string;
  timeStamp: number;
}

interface ScanBufferOptions {
  thresholdMs?: number;
  minLength?: number;
  onScan: (code: string) => void;
}

export function createScanBuffer(options: ScanBufferOptions) {
  const thresholdMs = options.thresholdMs ?? 30;
  const minLength = options.minLength ?? 3;
  let buffer = '';
  let lastTime = 0;

  function reset() {
    buffer = '';
    lastTime = 0;
  }

  function handleKey(event: KeyLike) {
    const isEnter = event.key === 'Enter';
    const isQuick = lastTime === 0 || event.timeStamp - lastTime <= thresholdMs;

    if (isEnter) {
      if (isQuick && buffer.length >= minLength) {
        options.onScan(buffer);
      }
      reset();
      return;
    }

    if (event.key.length !== 1) {
      return;
    }

    if (!isQuick) {
      buffer = '';
    }

    buffer += event.key;
    lastTime = event.timeStamp;
  }

  return { handleKey, reset };
}

export function useScanGun(options: ScanBufferOptions) {
  const scanner = createScanBuffer(options);
  const handler = (event: KeyboardEvent) => scanner.handleKey(event);

  onMounted(() => window.addEventListener('keydown', handler));
  onBeforeUnmount(() => window.removeEventListener('keydown', handler));

  return scanner;
}
