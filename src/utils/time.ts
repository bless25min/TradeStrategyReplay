const HAS_TIMEZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

export const parseTimestamp = (value: string | number, utcOffset = '+08:00'): number => {
  if (typeof value === 'number') {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }

  const raw = String(value).trim();
  if (/^\d{10,13}$/.test(raw)) {
    const numeric = Number(raw);
    return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }

  let normalized = raw.replace(/\//g, '-').replace(' ', 'T');
  if (!HAS_TIMEZONE.test(normalized)) normalized += utcOffset;

  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw new Error(`無法解析時間：${raw}`);
  return Math.floor(timestamp / 1000);
};

export const formatTimestamp = (timestamp: number, timezone = 'Asia/Taipei'): string => {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp * 1000));
};

export const formatDate = (timestamp: number, timezone = 'Asia/Taipei'): string => {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp * 1000));
};
