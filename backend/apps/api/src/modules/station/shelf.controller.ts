import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { RequirePermission } from '../identity/decorators';
import { SlotService } from './slot.service';

class BatchCreateSlotsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  rows?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  levels?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cols?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  codes?: string[];
}

@Controller('shelves')
export class ShelfController {
  constructor(private readonly slots: SlotService) {}

  @RequirePermission('station:manage')
  @Post(':id/slots/batch')
  batchCreateSlots(
    @Param('id') shelfId: string,
    @Body() dto: BatchCreateSlotsDto,
  ) {
    if (dto.codes?.length) {
      return this.slots.batchCreate(shelfId, { codes: dto.codes });
    }
    return this.slots.batchCreate(shelfId, {
      rows: dto.rows ?? 1,
      levels: dto.levels ?? 1,
      cols: dto.cols ?? 1,
    });
  }

  @RequirePermission('station:read')
  @Get(':id/slots')
  listSlotsByShelf(
    @Param('id') shelfId: string,
    @Query('status') status?: any,
  ) {
    return this.slots.listByShelf(shelfId, status);
  }
}
