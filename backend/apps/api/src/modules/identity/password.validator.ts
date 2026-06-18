import { applyDecorators } from '@nestjs/common';
import { Matches, MaxLength, MinLength } from 'class-validator';

/**
 * SEC-13 口令策略：长度 8-64 且必须同时包含字母与数字。
 * 复用于平台/租户/登录等所有口令字段，保证策略一致。
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

// 至少一个字母 + 至少一个数字（不限制特殊字符）
const PASSWORD_COMPLEXITY = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export const StrongPassword = () =>
  applyDecorators(
    MinLength(PASSWORD_MIN_LENGTH, {
      message: `密码至少 ${PASSWORD_MIN_LENGTH} 位`,
    }),
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: `密码最多 ${PASSWORD_MAX_LENGTH} 位`,
    }),
    Matches(PASSWORD_COMPLEXITY, {
      message: '密码必须同时包含字母和数字',
    }),
  );
