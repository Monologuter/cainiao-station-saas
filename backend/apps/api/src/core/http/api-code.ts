export const ApiCode = {
  OK: 0,
  BAD_REQUEST: 1001,
  UNAUTHORIZED: 1002,
  FORBIDDEN: 1003,
  NOT_FOUND: 1004,
  INTERNAL: 5000,
} as const;

export class BizError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}
