import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { StrongPassword } from './password.validator';

class LoginDto {
  @IsString()
  username: string;

  @IsString()
  @StrongPassword()
  password: string;
}

class RefreshDto {
  @IsString()
  refreshToken: string;
}

class ChangePasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  @StrongPassword()
  newPassword: string;
}

// TODO(SEC-13): 临时密码首登强制改密。需在 user schema 增加 mustChangePassword 字段，
// 由平台/店长重置密码时置位，登录后拦截非改密请求。本次仅落地口令强度策略。

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimit({
    keyPrefix: 'login',
    strategy: 'sliding-window',
    limit: 10,
    windowMs: 60_000,
    keyBy: 'login',
  })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Post('change-password')
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(
      user.userId,
      dto.oldPassword,
      dto.newPassword,
    );
  }

  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }

  @Get('permissions')
  permissions(@CurrentUser() user: any) {
    return user.perms ?? [];
  }

  @Get('menus')
  menus(@CurrentUser() user: any) {
    return this.auth.menusFor(user.perms ?? []);
  }
}
