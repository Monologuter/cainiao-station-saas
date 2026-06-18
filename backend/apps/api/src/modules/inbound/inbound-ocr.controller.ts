import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, Matches } from 'class-validator';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { RequirePermission } from '../identity/decorators';
import { InboundOcrService } from './inbound-ocr.service';

class RecognizeBody {
  @IsString()
  stationId: string;
}

class ConfirmBody {
  @IsString()
  recognitionId: string;

  @IsString()
  waybillNo: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone: string;

  @IsOptional()
  @IsString()
  courierCode?: string;
}

@Controller('inbound/ocr')
export class InboundOcrController {
  constructor(private readonly ocr: InboundOcrService) {}

  @RequirePermission('parcel:inbound')
  @RateLimit({
    keyPrefix: 'inbound-ocr',
    strategy: 'token-bucket',
    limit: 30,
    windowMs: 60_000,
    keyBy: 'user',
  })
  @Post('recognize')
  @UseInterceptors(FileInterceptor('image'))
  recognize(@Body() body: RecognizeBody, @UploadedFile() file: any) {
    return this.ocr.recognize({
      stationId: body.stationId,
      image: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype,
    });
  }

  @RequirePermission('parcel:inbound')
  @RateLimit({
    keyPrefix: 'inbound-ocr-batch',
    strategy: 'token-bucket',
    limit: 10,
    windowMs: 60_000,
    keyBy: 'user',
  })
  @Post('recognize-batch')
  @UseInterceptors(FilesInterceptor('images', 10))
  recognizeBatch(@Body() body: RecognizeBody, @UploadedFiles() files: any[]) {
    return this.ocr.recognizeBatch({
      stationId: body.stationId,
      images: files.map((file) => ({
        image: file.buffer,
        filename: file.originalname,
        contentType: file.mimetype,
      })),
    });
  }

  @RequirePermission('parcel:inbound')
  @Post('confirm')
  confirm(@Body() body: ConfirmBody) {
    return this.ocr.confirm(body);
  }
}
