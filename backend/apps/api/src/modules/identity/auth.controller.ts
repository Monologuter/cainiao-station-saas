import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';

class LoginDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}

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
