import type { BarData, StrategyTrade, ValidationResult } from '../types';

const findNearestBar = (quotes: BarData[], time: number): BarData | undefined => {
  if (!quotes.length) return undefined;
  let low = 0;
  let high = quotes.length - 1;
  let best = quotes[0];

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const bar = quotes[mid];
    if (Math.abs(bar.time - time) < Math.abs(best.time - time)) best = bar;
    if (bar.time === time) return bar;
    if (bar.time < time) low = mid + 1;
    else high = mid - 1;
  }
  return best;
};

export const validateStrategyData = (quotes: BarData[], trades: StrategyTrade[]): ValidationResult => {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  if (!quotes.length) errors.push({ level: 'error', message: '沒有可用的歷史報價資料。' });
  if (!trades.length) errors.push({ level: 'error', message: '沒有可用的策略交易紀錄。' });
  if (!quotes.length || !trades.length) return { errors, warnings };

  const first = quotes[0].time;
  const last = quotes[quotes.length - 1].time;
  const inferredInterval = quotes.length > 1 ? Math.max(1, quotes[1].time - quotes[0].time) : 60;

  trades.forEach((trade) => {
    if (trade.entryTime < first || trade.exitTime > last) {
      errors.push({ level: 'error', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 超出歷史報價期間。` });
      return;
    }

    const entryBar = findNearestBar(quotes, trade.entryTime);
    const exitBar = findNearestBar(quotes, trade.exitTime);
    if (!entryBar || !exitBar) return;

    if (Math.abs(entryBar.time - trade.entryTime) > inferredInterval * 2) {
      warnings.push({ level: 'warning', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 進場時間找不到足夠接近的 K 棒。` });
    }
    if (Math.abs(exitBar.time - trade.exitTime) > inferredInterval * 2) {
      warnings.push({ level: 'warning', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 出場時間找不到足夠接近的 K 棒。` });
    }

    const entryTolerance = Math.max(Math.abs(entryBar.high - entryBar.low) * 0.02, 0.000001);
    if (trade.entryPrice < entryBar.low - entryTolerance || trade.entryPrice > entryBar.high + entryTolerance) {
      warnings.push({ level: 'warning', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 進場價 ${trade.entryPrice} 超出對應 K 棒 High/Low。` });
    }

    const exitTolerance = Math.max(Math.abs(exitBar.high - exitBar.low) * 0.02, 0.000001);
    if (trade.exitPrice < exitBar.low - exitTolerance || trade.exitPrice > exitBar.high + exitTolerance) {
      warnings.push({ level: 'warning', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 出場價 ${trade.exitPrice} 超出對應 K 棒 High/Low。` });
    }
  });

  return { errors, warnings };
};
