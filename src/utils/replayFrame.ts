import type { BarData } from '../types';

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const inferBarInterval = (bars: BarData[], index: number): number => {
  if (bars.length < 2) return 60;
  if (index > 0) return Math.max(1, bars[index].time - bars[index - 1].time);
  return Math.max(1, bars[1].time - bars[0].time);
};

const lerp = (from: number, to: number, t: number): number => from + (to - from) * clamp01(t);

export const interpolateReplayBar = (bar: BarData, progress: number): { bar: BarData; price: number } => {
  const p = clamp01(progress);
  const firstExtreme = bar.close >= bar.open ? bar.low : bar.high;
  const secondExtreme = bar.close >= bar.open ? bar.high : bar.low;

  let price: number;
  let visited: number[];

  if (p <= 0.28) {
    price = lerp(bar.open, firstExtreme, p / 0.28);
    visited = [bar.open, price];
  } else if (p <= 0.72) {
    price = lerp(firstExtreme, secondExtreme, (p - 0.28) / 0.44);
    visited = [bar.open, firstExtreme, price];
  } else {
    price = lerp(secondExtreme, bar.close, (p - 0.72) / 0.28);
    visited = [bar.open, firstExtreme, secondExtreme, price];
  }

  return {
    price,
    bar: {
      ...bar,
      high: Math.max(...visited),
      low: Math.min(...visited),
      close: price,
    },
  };
};

export const replayTimestamp = (bars: BarData[], index: number, progress: number): number => {
  const bar = bars[index];
  if (!bar) return 0;
  return bar.time + Math.floor(inferBarInterval(bars, index) * clamp01(progress));
};
