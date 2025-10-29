import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SummaryMetric = {
  percentiles?: Record<string, number>;
};

type SummaryFile = {
  metrics?: Record<string, SummaryMetric>;
};

const input = process.argv[2] ?? 'artifacts/k6-summary.json';
const output = process.argv[3] ?? 'artifacts/k6-summary.txt';

function resolveP95(summary: SummaryFile): number | null {
  const metrics = summary.metrics ?? {};
  const candidate =
    metrics.availability_duration ?? metrics.http_req_duration ?? null;
  const percentiles = candidate?.percentiles;
  if (!percentiles) return null;
  const p95 = percentiles['95'] ?? percentiles['0.95'];
  return typeof p95 === 'number' ? p95 : null;
}

function main() {
  const summaryPath = resolve(process.cwd(), input);
  const outputPath = resolve(process.cwd(), output);
  const raw = readFileSync(summaryPath, 'utf-8');
  const summary = JSON.parse(raw) as SummaryFile;
  const p95 = resolveP95(summary);
  const lines = [`source=${summaryPath}`];
  if (p95 !== null) {
    lines.push(`availability_p95_ms=${Math.round(p95 * 1000)}`);
  } else {
    lines.push('availability_p95_ms=unknown');
  }
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf-8');
  console.log(lines.join(' '));
}

main();
