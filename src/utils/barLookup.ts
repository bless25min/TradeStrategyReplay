import type { BarData } from '../types';

export const inferBarInterval = (quotes: BarData[]): number => {
  if (quotes.length < 2) return 60;
  const intervals: number[] = [];
  for (let i = 1; i < Math.min(quotes.length, 50); i += 1) {
    const interval = quotes[i].time - quotes[i - 1].time;
    if (interval > 0) intervals.push(interval);
  }
  if (!intervals.length) return 60;
  intervals.sort((a, b) => a - b);
  return intervals[Math.floor(intervals.length / 2)];
};

export const findContainingBarIndex = (quotes: BarData[], time: number): number => {
  if (!quotes.length) return -1;
  if (time < quotes[0].time) return -1;

  let low = 0;
  let high = quotes.length - 1;
  let candidate = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (quotes[mid].time <= time) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (candidate < 0) return -1;
  const nextStart = quotes[candidate + 1]?.time ?? (quotes[candidate].time + inferBarInterval(quotes));
  return time < nextStart ? candidate : -1;
};

export const findContainingBar = (quotes: BarData[], time: number): BarData | undefined => {
  const index = findContainingBarIndex(quotes, time);
  return index >= 0 ? quotes[index] : undefined;
};
