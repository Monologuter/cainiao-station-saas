import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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
    // tenantId/stationId 由 service 依据 refId + 已验证手机号反查得出，
    // 不再信任请求 body 中的 tenantId/stationId。
    return this.reviews.submit(member.id, consumer.phone, body);
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
    // tenantId/stationId 由 service 依据 refId + 已验证手机号反查得出，
    // 不再信任请求 body 中的 tenantId/stationId。
    return this.reviews.submitComplaint(member.id, consumer.phone, body);
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
