import { http } from './http';

export type SlotStatus = 'FREE' | 'OCCUPIED' | 'DISABLED';

export interface ShelfItem {
  id: string;
  tenantId: string;
  stationId: string;
  code: string;
  name: string;
  zone?: string | null;
  status: string;
  totalSlots: number;
  occupiedSlots: number;
  usageRate?: number;
}

export interface SlotItem {
  id: string;
  code: string;
  status: SlotStatus;
  currentParcelId?: string | null;
  rowNo?: number | null;
  levelNo?: number | null;
  colNo?: number | null;
}

export interface SlotHeatmapItem {
  slotId: string;
  slotCode?: string | null;
  pickCount: number;
  storeCount?: number;
  avgDwellMinutes?: number;
  hourHistogram?: number[];
}

export interface CreateShelfPayload {
  code: string;
  name: string;
  zone?: string;
}

export interface BatchSlotPayload {
  rows: number;
  levels: number;
  cols: number;
}

export function buildBatchSlotPayload(payload: BatchSlotPayload) {
  return {
    rows: payload.rows,
    levels: payload.levels,
    cols: payload.cols,
  };
}

export function shelfUsagePercent(shelf: Pick<ShelfItem, 'totalSlots' | 'occupiedSlots' | 'usageRate'>) {
  if (typeof shelf.usageRate === 'number') {
    return Math.round(shelf.usageRate * 100);
  }
  if (!shelf.totalSlots) {
    return 0;
  }
  return Math.round((shelf.occupiedSlots / shelf.totalSlots) * 100);
}

export function slotHeatIntensity(slot: Pick<SlotHeatmapItem, 'pickCount'>, maxPickCount: number) {
  if (!maxPickCount) {
    return 0;
  }
  return Math.round((slot.pickCount / maxPickCount) * 100);
}

export function listShelvesApi(stationId: string) {
  return http.get<never, ShelfItem[]>(`/stations/${stationId}/shelves`);
}

export function createShelfApi(stationId: string, payload: CreateShelfPayload) {
  return http.post<never, ShelfItem>(`/stations/${stationId}/shelves`, payload);
}

export function listSlotsApi(shelfId: string) {
  return http.get<never, SlotItem[]>(`/shelves/${shelfId}/slots`);
}

export function listSlotHeatmapApi(stationId: string, date?: string) {
  return http.get<never, SlotHeatmapItem[]>(`/stations/${stationId}/slots/heatmap`, {
    params: date ? { date } : {},
  });
}

export function batchCreateSlotsApi(shelfId: string, payload: BatchSlotPayload) {
  return http.post<never, { created: number }>(
    `/shelves/${shelfId}/slots/batch`,
    buildBatchSlotPayload(payload),
  );
}
