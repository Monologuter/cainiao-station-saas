import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  @Post('confirm')
  confirm(@Body() body: ConfirmBody) {
    return this.ocr.confirm(body);
  }
}
