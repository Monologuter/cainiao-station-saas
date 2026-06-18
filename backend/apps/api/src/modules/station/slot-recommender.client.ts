import { Injectable } from '@nestjs/common';

export interface SlotRecommendation {
  slotId: string;
  score: number;
  reasons: string[];
}

interface RecommendInput {
  stationId: string;
  parcel: {
    phoneTail: string;
    sizeClass: 'S' | 'M' | 'L';
    inboundHour: number;
  };
  candidates: Array<{
    slotId: string;
    slotCode: string;
    sizeCapacity: 'S' | 'M' | 'L';
    distanceRank: number;
    heat: {
      pickCount7d: number;
      hourHistogram: number[];
    };
  }>;
}

@Injectable()
export class SlotRecommenderClient {
  private readonly baseUrl =
    process.env.AI_SERVICE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000';
  private readonly serviceToken =
    process.env.AI_SERVICE_TOKEN ??
    process.env.SERVICE_TOKEN ??
    'dev-service-token';

  async recommend(input: RecommendInput): Promise<SlotRecommendation[] | null> {
    if ((process.env.SLOT_RECOMMEND_PROVIDER ?? 'ai') === 'mock') {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    try {
      const response = await fetch(`${this.baseUrl}/slot/recommend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': this.serviceToken,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as {
        recommendations?: SlotRecommendation[];
      };
      return body.recommendations ?? [];
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
