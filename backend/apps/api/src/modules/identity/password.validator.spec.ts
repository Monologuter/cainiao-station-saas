import { IsString, validateSync } from 'class-validator';
import { StrongPassword } from './password.validator';

// 镜像三个控制器里的口令字段用法（login / changePassword / createPlatformUser /
// createTenant.ownerPassword 共用同一条 StrongPassword 规则）。
class PasswordProbe {
  @IsString()
  @StrongPassword()
  password!: string;
}

function failures(password: unknown): string[] {
  const probe = new PasswordProbe();
  probe.password = password as string;
  const errors = validateSync(probe);
  const field = errors.find((e) => e.property === 'password');
  return field ? Object.values(field.constraints ?? {}) : [];
}

describe('StrongPassword policy (SEC-13)', () => {
  it('accepts compliant passwords (>=8, letters + digits)', () => {
    for (const pwd of ['admin123456', 'pw123456', 'pw654321a', 'Abc12345']) {
      expect(failures(pwd)).toEqual([]);
    }
  });

  it('rejects passwords shorter than 8 chars', () => {
    expect(failures('pw1234')).toContain('密码至少 8 位');
  });

  it('rejects passwords longer than 64 chars', () => {
    const tooLong = 'a1' + 'x'.repeat(63); // 65 chars, has letter+digit
    expect(failures(tooLong)).toContain('密码最多 64 位');
  });

  it('rejects digit-only passwords (no letter)', () => {
    // 旧改密用例 pw654321 实为纯数字，必须被复杂度规则拒绝
    expect(failures('12345678')).toContain('密码必须同时包含字母和数字');
  });

  it('rejects letter-only passwords (no digit)', () => {
    expect(failures('abcdefgh')).toContain('密码必须同时包含字母和数字');
  });
});
