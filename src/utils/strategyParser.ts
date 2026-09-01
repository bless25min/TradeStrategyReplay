import type { BarData, StrategyTrade, TradeSide } from '../types';
import { parseCsv } from './csv';
import { parseTimestamp } from './time';

const numberValue = (value: string | undefined, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalNumber = (value: string | undefined): number | undefined => {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseQuotesCsv = (text: string, utcOffset = '+08:00'): BarData[] => {
  const rows = parseCsv(text);
  const bars = rows.map((row, index) => {
    const timeRaw = row.date && row.time
      ? `${row.date} ${row.time}`
      : row.datetime || row.timestamp || row.time;
    if (!timeRaw) throw new Error(`歷史報價第 ${index + 2} 列缺少 time / date`);

    const bar: BarData = {
      time: parseTimestamp(timeRaw, utcOffset),
      open: numberValue(row.open, Number.NaN),
      high: numberValue(row.high, Number.NaN),
      low: numberValue(row.low, Number.NaN),
      close: numberValue(row.close, Number.NaN),
      volume: optionalNumber(row.volume || row.vol || row.tickvol),
      contract: row.contract || undefined,
    };

    if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) {
      throw new Error(`歷史報價第 ${index + 2} 列 OHLC 格式錯誤`);
    }
    return bar;
  });

  const deduped = new Map<number, BarData>();
  bars.forEach((bar) => deduped.set(bar.time, bar));
  return [...deduped.values()].sort((a, b) => a.time - b.time);
};

const normalizeSide = (value: string): TradeSide => {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'LONG' || normalized === 'BUY' || normalized === '多') return 'LONG';
  if (normalized === 'SHORT' || normalized === 'SELL' || normalized === '空') return 'SHORT';
  throw new Error(`未知交易方向：${value}`);
};

export const parseTradesCsv = (text: string, utcOffset = '+08:00'): StrategyTrade[] => {
  const rows = parseCsv(text);
  return rows
    .map((row, index) => {
      const tradeId = row.trade_id || row.tradeid || row.id || String(index + 1);
      const entryTimeRaw = row.entry_time || row.entrytime || row.open_time || row.opentime;
      const exitTimeRaw = row.exit_time || row.exittime || row.close_time || row.closetime;
      if (!entryTimeRaw || !exitTimeRaw) throw new Error(`交易 ${tradeId} 缺少進出場時間`);

      const trade: StrategyTrade = {
        tradeId,
        side: normalizeSide(row.side || row.type || row.direction || ''),
        entryTime: parseTimestamp(entryTimeRaw, utcOffset),
        entryPrice: numberValue(row.entry_price || row.entryprice || row.open_price || row.openprice, Number.NaN),
        exitTime: parseTimestamp(exitTimeRaw, utcOffset),
        exitPrice: numberValue(row.exit_price || row.exitprice || row.close_price || row.closeprice, Number.NaN),
        quantity: numberValue(row.qty || row.quantity || row.volume || row.lots, 1),
        pnlPoints: numberValue(row.pnl_points || row.pnlpoints, Number.NaN),
        pnlAmount: optionalNumber(row.pnl_amount || row.pnlamount || row.profit),
        fees: optionalNumber(row.fees),
        slippage: optionalNumber(row.slippage),
        netPnl: optionalNumber(row.net_pnl || row.netpnl),
        contract: row.contract || row.symbol || undefined,
        note: row.note || undefined,
      };

      if (![trade.entryPrice, trade.exitPrice].every(Number.isFinite)) {
        throw new Error(`交易 ${tradeId} 的進出場價格格式錯誤`);
      }
      if (!Number.isFinite(trade.pnlPoints)) {
        trade.pnlPoints = trade.side === 'LONG'
          ? trade.exitPrice - trade.entryPrice
          : trade.entryPrice - trade.exitPrice;
      }
      if (trade.exitTime < trade.entryTime) throw new Error(`交易 ${tradeId} 出場時間早於進場時間`);
      return trade;
    })
    .sort((a, b) => a.entryTime - b.entryTime);
};
