import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { CurrentUser, Public, RequirePermission } from '../identity/decorators';
import { MemberService } from '../member/member.service';
import { ReviewService } from './review.service';
import { SatisfactionService } from './satisfaction.service';

@Public()
@Controller()
export class ConsumerReviewController {
  constructor(
    private readonly members: MemberService,
    private readonly reviews: ReviewService,
  ) {}

  @Post('reviews')
  async submitReview(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
  ) {
    const { member, consumer } =
      await this.members.requireMember(authorization);
    return TenantContext.run(
      {
        userId: consumer.sub,
        tenantId: body.tenantId,
        roles: ['consumer'],
        isPlatform: false,
      },
      () => this.reviews.submit(member.id, body),
    );
  }

  @Get('reviews/mine')
  async myReviews(@Headers('authorization') authorization: string | undefined) {
    const { member } = await this.members.requireMember(authorization);
    return this.reviews.listMine(member.id, 'review');
  }

  @Post('complaints')
  async submitComplaint(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
  ) {
    const { member, consumer } =
      await this.members.requireMember(authorization);
    return TenantContext.run(
      {
        userId: consumer.sub,
        tenantId: body.tenantId,
        roles: ['consumer'],
        isPlatform: false,
      },
      () => this.reviews.submitComplaint(member.id, body),
    );
  }

  @Get('complaints/mine')
  async myComplaints(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const { member } = await this.members.requireMember(authorization);
    return this.reviews.listMine(member.id, 'complaint');
  }
}

@Controller('admin')
export class ReviewAdminController {
  constructor(
    private readonly reviews: ReviewService,
    private readonly satisfaction: SatisfactionService,
  ) {}

  @RequirePermission('review:read')
  @Get('reviews')
  listReviews(@CurrentUser() user: any, @Query() query: any) {
    return this.reviews.listForStation(user.tenantId, query);
  }

  @RequirePermission('review:reply')
  @Post('reviews/:id/reply')
  replyReview(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.reviews.reply(id, user.userId, body.content);
  }

  @RequirePermission('review:manage')
  @Post('reviews/:id/hide')
  hideReview(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.reviews.hide(id, user.userId, body.reason);
  }

  @RequirePermission('complaint:read')
  @Get('complaints')
  listComplaints(@CurrentUser() user: any, @Query() query: any) {
    return this.reviews.listComplaints(user.tenantId, query);
  }

  @RequirePermission('complaint:handle')
  @Post('complaints/:id/handle')
  handleComplaint(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.reviews.handleComplaint(id, user.userId, body);
  }

  @RequirePermission('review:read')
  @Get('satisfaction/summary')
  satisfactionSummary(@CurrentUser() user: any, @Query() query: any) {
    return this.satisfaction.summary(user.tenantId, query);
  }
}
