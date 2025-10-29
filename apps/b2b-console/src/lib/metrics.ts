type LabelMap = Record<string, string>;

type HistogramSample = {
  labels: LabelMap;
  value: number;
  le: number;
};

function parseLabels(raw: string): LabelMap {
  if (!raw) return {};
  return raw.split(',').reduce<LabelMap>((acc, pair) => {
    const [key, rawValue] = pair.split('=');
    if (!key || rawValue === undefined) return acc;
    const trimmedKey = key.trim();
    const value = rawValue.trim().replace(/^"|"$/g, '');
    acc[trimmedKey] = value;
    return acc;
  }, {});
}

function parseHistogram(metricText: string, metricName: string): HistogramSample[] {
  const escapedMetric = metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `^${escapedMetric}\\{([^}]*)\\}\\s+([-+]?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)$`,
    'i',
  );

  return metricText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.match(regex))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => {
      const labels = parseLabels(match[1] ?? '');
      const { le: leRaw, ...rest } = labels;
      const le = leRaw === '+Inf' ? Number.POSITIVE_INFINITY : Number.parseFloat(leRaw ?? '');
      const value = Number(match[2] ?? '');
      if (Number.isNaN(le) || Number.isNaN(value)) return undefined;
      return {
        labels: rest,
        value,
        le,
      };
    })
    .filter((sample): sample is HistogramSample => sample !== undefined);
}

function computeQuantile(buckets: HistogramSample[], quantile: number): number | undefined {
  if (buckets.length === 0) return undefined;
  const sorted = [...buckets].sort((a, b) => a.le - b.le);
  const total = sorted[sorted.length - 1]?.value;
  if (!total || !Number.isFinite(total)) return undefined;
  const target = total * quantile;
  let lastFinite: number | undefined;
  for (const bucket of sorted) {
    if (Number.isFinite(bucket.le)) {
      lastFinite = bucket.le;
    }
    if (bucket.value >= target) {
      return Number.isFinite(bucket.le) ? bucket.le : lastFinite;
    }
  }
  return lastFinite;
}

export function extractAvailabilityP95(metricsText: string): number | undefined {
  const samples = parseHistogram(metricsText, 'http_request_duration_seconds_bucket').filter(
    (sample) =>
      sample.labels.method?.toUpperCase() === 'GET' &&
      (sample.labels.route === '/v1/availability' || sample.labels.route === '/availability') &&
      (sample.labels.status_code === '200' || sample.labels.status_code === undefined),
  );

  return computeQuantile(samples, 0.95);
}

type GaugeSample = {
  labels: LabelMap;
  value: number;
};

function parseGauge(metricText: string, metricName: string): GaugeSample[] {
  const escapedMetric = metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `^${escapedMetric}(?:\\{([^}]*)\\})?\\s+([-+]?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)$`,
    'i',
  );

  return metricText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.match(regex))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => {
      const labels = parseLabels(match[1] ?? '');
      const value = Number(match[2] ?? '');
      if (Number.isNaN(value)) return undefined;
      return { labels, value };
    })
    .filter((sample): sample is GaugeSample => sample !== undefined);
}

export function extractNotificationWorkerWindow(metricsText: string) {
  const samples = parseGauge(metricsText, 'notifications_recent_total');
  if (samples.length === 0) return undefined;

  const sent = samples.find(
    (sample) => sample.labels.status === 'sent' && sample.labels.window === '15m',
  );
  const failed = samples.find(
    (sample) => sample.labels.status === 'failed' && sample.labels.window === '15m',
  );

  if (!sent && !failed) return undefined;

  return {
    sent: sent?.value ?? 0,
    failed: failed?.value ?? 0,
  };
}
