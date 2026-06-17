import { Injectable } from '@nestjs/common';
import { EventBus } from '../../../core/event-bus/event-bus';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { FileStorageService } from '../../file/file-storage.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import type { SubmitApplicationInput } from './application.dto';
import {
  assertApplicationTransition,
  type ApplicationAction,
} from './application.state';

const REQUIRED_QUALIFICATIONS = {
  COMPANY: ['BUSINESS_LICENSE'],
  INDIVIDUAL: ['ID_CARD_FRONT', 'ID_CARD_BACK'],
} as const;

@Injectable()
export class ApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileStorageService = new FileStorageService(),
    private readonly onboarding?: OnboardingService,
    private readonly eventBus: EventBus = new EventBus(),
  ) {}

  async submit(input: SubmitApplicationInput) {
    this.assertRequiredFields(input);
    const applicationNo = this.nextApplicationNo();

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const pending = await tx.tenantApplication.findFirst({
        where: {
          contactPhone: input.contactPhone,
          status: 'PENDING',
          deletedAt: null,
        },
        select: { applicationNo: true },
      });
      if (pending) {
        throw new BizError(
          ApiCode.BAD_REQUEST,
          `您已有待审核申请：${pending.applicationNo}`,
        );
      }

      const existingUser = await tx.user.findFirst({
        where: {
          OR: [{ username: input.contactPhone }, { phone: input.contactPhone }],
        },
        select: { id: true },
      });
      if (existingUser) {
        throw new BizError(ApiCode.BAD_REQUEST, '该手机号已注册门店');
      }

      try {
        const created = await tx.tenantApplication.create({
          data: {
            applicationNo,
            status: 'PENDING',
            entityType: input.entityType,
            entityName: input.entityName,
            unifiedCreditCode: input.unifiedCreditCode,
            regionCode: input.regionCode,
            contactName: input.contactName,
            contactPhone: input.contactPhone,
            contactEmail: input.contactEmail,
            stationName: input.stationName,
            stationAddress: input.stationAddress,
            proposedPlanCode: input.proposedPlanCode,
            qualifications: input.qualifications as any,
          },
        });
        return {
          applicationNo: created.applicationNo,
          status: created.status,
        };
      } catch (error: any) {
        if (error?.code === 'P2002') {
          throw new BizError(ApiCode.BAD_REQUEST, '您已有待审核申请');
        }
        throw error;
      }
    });
  }

  async track(applicationNo: string, contactPhone: string) {
    const application = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.tenantApplication.findFirst({
        where: { applicationNo, contactPhone, deletedAt: null },
        select: { applicationNo: true, status: true, rejectReason: true },
      });
    });
    if (!application) {
      throw new BizError(ApiCode.NOT_FOUND, '申请不存在');
    }
    return {
      applicationNo: application.applicationNo,
      status: application.status,
      rejectReason: application.rejectReason,
    };
  }

  async detail(id: string) {
    const application = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.tenantApplication.findUnique({ where: { id } });
    });
    if (!application) {
      throw new BizError(ApiCode.NOT_FOUND, '申请不存在');
    }
    const qualifications = this.normalizeQualifications(
      application.qualifications,
    ).map((item) => ({
      ...item,
      downloadUrl: this.files.createDownloadUrl(item.fileKey).downloadUrl,
    }));
    return {
      ...application,
      qualifications,
    };
  }

  async approve(
    id: string,
    reviewerId: string,
    override: { planCode?: string; stationName?: string } = {},
  ) {
    await this.requireReviewable(id, 'approve');
    if (!this.onboarding) {
      throw new BizError(ApiCode.INTERNAL, '入驻编排服务未配置');
    }
    const result = await this.onboarding.provision({
      applicationId: id,
      reviewerId,
      ...override,
    });
    return {
      tenantId: result.tenantId,
      ownerUsername: result.ownerUsername,
    };
  }

  async reject(id: string, reviewerId: string, rejectReason: string) {
    const reason = rejectReason.trim();
    if (!reason) {
      throw new BizError(ApiCode.BAD_REQUEST, '驳回原因必填');
    }
    const application = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const current = await tx.tenantApplication.findUnique({
        where: { id },
        select: { id: true, status: true, contactPhone: true },
      });
      if (!current) {
        throw new BizError(ApiCode.NOT_FOUND, '申请不存在');
      }
      assertApplicationTransition(current.status, 'reject');
      return tx.tenantApplication.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          rejectReason: reason,
        },
      });
    });
    await this.eventBus.publish(
      EventBus.createEvent('ApplicationRejected', {
        applicationId: application.id,
        contactPhone: application.contactPhone,
        rejectReason: reason,
      }),
    );
  }

  private assertRequiredFields(input: SubmitApplicationInput) {
    if (input.entityType === 'COMPANY' && !input.unifiedCreditCode) {
      throw new BizError(ApiCode.BAD_REQUEST, '企业申请需填写统一社会信用代码');
    }
    const required = REQUIRED_QUALIFICATIONS[input.entityType];
    const provided = new Set(input.qualifications.map((item) => item.type));
    const complete = required.every((type) => provided.has(type));
    if (!complete) {
      throw new BizError(ApiCode.BAD_REQUEST, '资质材料不完整');
    }
  }

  private nextApplicationNo() {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(
      Math.random() * 100,
    )
      .toString()
      .padStart(2, '0')}`;
    return `APP${date}-${suffix}`;
  }

  private normalizeQualifications(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item) => item && typeof item === 'object')
      .map((item: any) => ({
        type: String(item.type ?? ''),
        fileKey: String(item.fileKey ?? ''),
        fileName: String(item.fileName ?? ''),
      }))
      .filter((item) => item.fileKey);
  }

  private async requireReviewable(id: string, action: ApplicationAction) {
    const application = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.tenantApplication.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
    });
    if (!application) {
      throw new BizError(ApiCode.NOT_FOUND, '申请不存在');
    }
    assertApplicationTransition(application.status, action);
    return application;
  }
}
