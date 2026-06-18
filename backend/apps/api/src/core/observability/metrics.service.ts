import { Injectable } from '@nestjs/common';

type MetricKey = `${string}|${string}|${number}`;

@Injectable()
export class MetricsService {
  private readonly counters = new Map<MetricKey, number>();
  private readonly durations = new Map<
    MetricKey,
    { count: number; sum: number }
  >();
  private readonly scheduledJobSkips = new Map<string, number>();

  recordHttpRequest(input: {
    method: string;
    route: string;
    status: number;
    durationSeconds: number;
  }) {
    const method = input.method.toUpperCase();
    const route = input.route || 'unknown';
    const key: MetricKey = `${method}|${route}|${input.status}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);

    const current = this.durations.get(key) ?? { count: 0, sum: 0 };
    current.count += 1;
    current.sum += input.durationSeconds;
    this.durations.set(key, current);
  }

  render(): string {
    const lines = [
      '# HELP http_requests_total Total HTTP requests handled by the API.',
      '# TYPE http_requests_total counter',
    ];

    for (const [key, value] of this.counters.entries()) {
      const [method, route, status] = key.split('|');
      lines.push(
        `http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`,
      );
    }

    lines.push(
      '# HELP http_request_duration_seconds HTTP request duration in seconds.',
      '# TYPE http_request_duration_seconds summary',
    );

    for (const [key, value] of this.durations.entries()) {
      const [method, route, status] = key.split('|');
      const labels = `method="${method}",route="${route}",status="${status}"`;
      lines.push(
        `http_request_duration_seconds_count{${labels}} ${value.count}`,
      );
      lines.push(
        `http_request_duration_seconds_sum{${labels}} ${value.sum.toFixed(6)}`,
      );
    }

    lines.push(
      '# HELP scheduled_job_skipped_total Total scheduled job executions skipped because another instance holds the lock.',
      '# TYPE scheduled_job_skipped_total counter',
    );
    for (const [name, value] of this.scheduledJobSkips.entries()) {
      lines.push(`scheduled_job_skipped_total{name="${name}"} ${value}`);
    }

    return `${lines.join('\n')}\n`;
  }

  recordScheduledJobSkipped(name: string) {
    this.scheduledJobSkips.set(
      name,
      (this.scheduledJobSkips.get(name) ?? 0) + 1,
    );
  }
}
