import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiCode, BizError } from '../../core/http/api-code';

const FILE_TYPE_SLUG: Record<string, string> = {
  BUSINESS_LICENSE: 'business-license',
  ID_CARD_FRONT: 'id-card-front',
  ID_CARD_BACK: 'id-card-back',
  STOREFRONT: 'storefront',
};

const CONTENT_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

@Injectable()
export class FileStorageService {
  createUploadUrl(input: {
    fileType: string;
    contentType: string;
    now?: Date;
  }) {
    const slug = FILE_TYPE_SLUG[input.fileType];
    const ext = CONTENT_EXT[input.contentType];
    if (!slug) {
      throw new BizError(ApiCode.BAD_REQUEST, '不支持的材料类型');
    }
    if (!ext) {
      throw new BizError(ApiCode.BAD_REQUEST, '不支持的文件类型');
    }

    const now = input.now ?? new Date();
    const month = `${now.getUTCFullYear()}${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    const fileKey = `onboarding/${month}/${randomUUID()}-${slug}.${ext}`;
    return {
      uploadUrl: `mock://upload/${fileKey}`,
      fileKey,
      expiresIn: 600,
    };
  }

  createDownloadUrl(fileKey: string) {
    if (!fileKey.startsWith('onboarding/')) {
      throw new BizError(ApiCode.BAD_REQUEST, '非法文件键');
    }
    return {
      downloadUrl: `mock://download/${fileKey}`,
      expiresIn: 600,
    };
  }
}
