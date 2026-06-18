import { Injectable } from '@nestjs/common';

export interface ForecastPoint {
  targetDate: string;
  predicted: number;
  lower: number;
  upper: number;
  hourBreakdown?: number[] | null;
}

export interface ForecastResponse {
  method: 'MA' | 'HOLT_WINTERS' | 'FALLBACK_MEAN';
  forecasts: ForecastPoint[];
}

interface ForecastInput {
  stationId: string;
  granularity: 'DAY' | 'HOUR';
  history: Array<{
    date: string;
    volume: number;
    hourBreakdown?: number[] | null;
  }>;
  horizon: number;
}

@Injectable()
export class ForecastClient {
  private readonly baseUrl =
    process.env.AI_SERVICE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000';
  private readonly serviceToken =
    process.env.AI_SERVICE_TOKEN ??
    process.env.SERVICE_TOKEN ??
    'dev-service-token';

  async forecast(input: ForecastInput): Promise<ForecastResponse | null> {
    if ((process.env.FORECAST_PROVIDER ?? 'mock') !== 'ai') {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      const response = await fetch(`${this.baseUrl}/forecast/volume`, {
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
      return (await response.json()) as ForecastResponse;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
