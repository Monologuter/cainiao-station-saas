import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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
    this.assertManagedObjectKey(fileKey);
    return {
      downloadUrl: `mock://download/${fileKey}`,
      expiresIn: 600,
    };
  }

  createWaybillImageObject(input: {
    tenantId: string;
    contentType: string;
    now?: Date;
  }) {
    const ext = CONTENT_EXT[input.contentType];
    if (!ext || ext === 'pdf') {
      throw new BizError(ApiCode.BAD_REQUEST, '不支持的面单图片类型');
    }

    const now = input.now ?? new Date();
    const day = `${now.getUTCFullYear()}${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const fileKey = `waybills/${input.tenantId}/${day}/${randomUUID()}.${ext}`;
    return {
      uploadUrl: `mock://upload/${fileKey}`,
      fileKey,
      expiresIn: 600,
    };
  }

  async storeObject(input: {
    fileKey: string;
    contentType: string;
    body: string | Buffer;
  }) {
    this.assertManagedObjectKey(input.fileKey);
    const absolutePath = resolve(this.storageRoot(), input.fileKey);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.body);
    return {
      fileKey: input.fileKey,
      contentType: input.contentType,
      downloadUrl: this.createDownloadUrl(input.fileKey).downloadUrl,
    };
  }

  private storageRoot() {
    return resolve(process.env.FILE_STORAGE_ROOT ?? '.local-storage');
  }

  private assertManagedObjectKey(fileKey: string) {
    const allowedPrefix =
      fileKey.startsWith('onboarding/') ||
      fileKey.startsWith('waybills/') ||
      fileKey.startsWith('reports/');
    if (
      !allowedPrefix ||
      fileKey.startsWith('/') ||
      fileKey.includes('..') ||
      fileKey.includes('\\')
    ) {
      throw new BizError(ApiCode.BAD_REQUEST, '非法文件键');
    }
  }
}
