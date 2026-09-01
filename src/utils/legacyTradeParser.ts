import type { LegacyTradeAction, StrategyTrade, TradeSide } from '../types';
import { parseTimestamp } from './time';

interface OpenLot {
  side: TradeSide;
  time: number;
  price: number;
  quantity: number;
  symbol?: string;
}

const quantityOf = (action: LegacyTradeAction): number => {
  const value = Number(action.qty ?? action.volume ?? 0);
  return Number.isFinite(value) ? value : 0;
};

export const parseLegacyActionTrades = (
  data: LegacyTradeAction[],
  symbolFilter?: string,
): StrategyTrade[] => {
  const actions = data
    .filter((action) => !symbolFilter || action.symbol === symbolFilter)
    .map((action) => ({ ...action, parsedTime: parseTimestamp(action.time) }))
    .sort((a, b) => a.parsedTime - b.parsedTime);

  const longs: OpenLot[] = [];
  const shorts: OpenLot[] = [];
  const trades: StrategyTrade[] = [];
  let sequence = 1;

  const closeQueue = (
    queue: OpenLot[],
    action: LegacyTradeAction & { parsedTime: number },
    side: TradeSide,
  ) => {
    let remaining = quantityOf(action);
    while (remaining > 0.0000001 && queue.length) {
      const open = queue[0];
      const closedQty = Math.min(remaining, open.quantity);
      const pnlPoints = side === 'LONG'
        ? Number(action.price) - open.price
        : open.price - Number(action.price);

      trades.push({
        tradeId: `legacy-${sequence++}`,
        side,
        entryTime: open.time,
        entryPrice: open.price,
        exitTime: action.parsedTime,
        exitPrice: Number(action.price),
        quantity: closedQty,
        pnlPoints,
        pnlAmount: action.profit == null ? undefined : Number(action.profit),
        contract: action.symbol || open.symbol,
        note: 'Converted from SoyaPlayableAd legacy action log',
      });

      open.quantity -= closedQty;
      remaining -= closedQty;
      if (open.quantity <= 0.0000001) queue.shift();
    }
  };

  actions.forEach((action) => {
    const type = String(action.type).trim().toLowerCase();
    const quantity = quantityOf(action);
    if (!Number.isFinite(Number(action.price)) || quantity <= 0) return;

    if (type === 'buy') {
      longs.push({ side: 'LONG', time: action.parsedTime, price: Number(action.price), quantity, symbol: action.symbol });
    } else if (type === 'sell') {
      shorts.push({ side: 'SHORT', time: action.parsedTime, price: Number(action.price), quantity, symbol: action.symbol });
    } else if (type === 'close_buy' || type === 'close_long') {
      closeQueue(longs, action, 'LONG');
    } else if (type === 'close_sell' || type === 'close_short') {
      closeQueue(shorts, action, 'SHORT');
    }
  });

  return trades.sort((a, b) => a.entryTime - b.entryTime);
};
