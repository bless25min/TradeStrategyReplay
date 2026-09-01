import type { BarData, StrategyTrade, ValidationResult } from '../types';
import { findContainingBar } from './barLookup';

export const validateStrategyData = (quotes: BarData[], trades: StrategyTrade[]): ValidationResult => {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  if (!quotes.length) errors.push({ level: 'error', message: '沒有可用的歷史報價資料。' });
  if (!trades.length) errors.push({ level: 'error', message: '沒有可用的策略交易紀錄。' });
  if (!quotes.length || !trades.length) return { errors, warnings };

  const first = quotes[0].time;
  const last = quotes[quotes.length - 1].time;

  trades.forEach((trade) => {
    if (trade.entryTime < first || trade.exitTime < first || trade.entryTime > last || trade.exitTime > last) {
      errors.push({ level: 'error', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 超出歷史報價期間。` });
      return;
    }

    const entryBar = findContainingBar(quotes, trade.entryTime);
    const exitBar = findContainingBar(quotes, trade.exitTime);
    if (!entryBar) {
      warnings.push({ level: 'warning', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 進場時間沒有落在任何 K 棒區間。` });
      return;
    }
    if (!exitBar) {
      warnings.push({ level: 'warning', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 出場時間沒有落在任何 K 棒區間。` });
      return;
    }

    const entryTolerance = Math.max(Math.abs(entryBar.high - entryBar.low) * 0.02, 0.000001);
    if (trade.entryPrice < entryBar.low - entryTolerance || trade.entryPrice > entryBar.high + entryTolerance) {
      warnings.push({ level: 'warning', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 進場價 ${trade.entryPrice} 超出該時間所屬 K 棒 High/Low。` });
    }

    const exitTolerance = Math.max(Math.abs(exitBar.high - exitBar.low) * 0.02, 0.000001);
    if (trade.exitPrice < exitBar.low - exitTolerance || trade.exitPrice > exitBar.high + exitTolerance) {
      warnings.push({ level: 'warning', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 出場價 ${trade.exitPrice} 超出該時間所屬 K 棒 High/Low。` });
    }

    if (trade.contract && entryBar.contract && trade.contract !== entryBar.contract) {
      warnings.push({ level: 'warning', tradeId: trade.tradeId, message: `交易 ${trade.tradeId} 合約 ${trade.contract} 與進場 K 棒合約 ${entryBar.contract} 不一致。` });
    }
  });

  return { errors, warnings };
};
