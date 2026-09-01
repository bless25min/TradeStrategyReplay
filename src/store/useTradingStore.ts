import { create } from 'zustand';
import type { ManualTrade, TradeSide, TradingConfig } from '../types';
import { inferBarInterval } from '../utils/replayFrame';
import { useMarketStore } from './useMarketStore';

interface TradingState {
  config: TradingConfig;
  balance: number;
  equity: number;
  floatingPL: number;
  openPositions: ManualTrade[];
  history: ManualTrade[];
  configureAndReset: (config: Partial<TradingConfig>) => void;
  placeOrder: (side: TradeSide, quantity: number) => string | null;
  closePosition: (id: number, reason?: ManualTrade['reason']) => void;
  markToMarket: (price: number) => void;
  reset: () => void;
}

const DEFAULT_CONFIG: TradingConfig = {
  initialBalance: 10_000,
  contractSize: 100,
  leverage: 500,
};

const positionPnl = (position: ManualTrade, price: number, contractSize: number): number => {
  const diff = position.side === 'LONG' ? price - position.entryPrice : position.entryPrice - price;
  return diff * position.quantity * contractSize;
};

const resetState = (config: TradingConfig) => ({
  balance: config.initialBalance,
  equity: config.initialBalance,
  floatingPL: 0,
  openPositions: [] as ManualTrade[],
  history: [] as ManualTrade[],
});

const marketNow = () => {
  const market = useMarketStore.getState();
  const bar = market.quotes[market.currentIndex];
  const price = market.livePrice ?? bar?.close;
  const interval = bar ? inferBarInterval(market.quotes, market.currentIndex) : 0;
  const time = bar ? bar.time + Math.floor(interval * market.barProgress) : 0;
  return { market, bar, price, time };
};

export const useTradingStore = create<TradingState>((set, get) => ({
  config: DEFAULT_CONFIG,
  ...resetState(DEFAULT_CONFIG),

  configureAndReset: (partial) => set((state) => {
    const config = { ...state.config, ...partial };
    return { config, ...resetState(config) };
  }),

  placeOrder: (side, quantity) => {
    const { market, bar, price, time } = marketNow();
    const state = get();
    if (market.mode !== 'replay') return '請先開始「歷史重播」再進行模擬交易。';
    if (!Number.isFinite(quantity) || quantity <= 0) return '交易數量必須大於 0。';
    if (!bar || !Number.isFinite(price)) return '目前沒有可交易的歷史價格。';

    const executionPrice = Number(price);
    const { contractSize, leverage } = state.config;
    const usedMargin = state.openPositions.reduce(
      (sum, position) => sum + (position.entryPrice * position.quantity * contractSize) / leverage,
      0,
    );
    const newMargin = (executionPrice * quantity * contractSize) / leverage;
    if (usedMargin + newMargin > state.equity) {
      return `模擬保證金不足，需要 ${(usedMargin + newMargin).toFixed(0)}，目前權益 ${state.equity.toFixed(0)}。`;
    }

    const position: ManualTrade = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      side,
      entryTime: time,
      entryPrice: executionPrice,
      quantity,
      status: 'OPEN',
    };
    set((current) => ({ openPositions: [...current.openPositions, position] }));
    return null;
  },

  closePosition: (id, reason = 'manual') => set((state) => {
    const { bar, price, time } = marketNow();
    const position = state.openPositions.find((item) => item.id === id);
    if (!position || !bar || !Number.isFinite(price)) return state;

    const executionPrice = Number(price);
    const pnl = positionPnl(position, executionPrice, state.config.contractSize);
    const closed: ManualTrade = {
      ...position,
      closeTime: time,
      closePrice: executionPrice,
      pnl,
      status: 'CLOSED',
      reason,
    };
    const balance = state.balance + pnl;
    const openPositions = state.openPositions.filter((item) => item.id !== id);
    const floatingPL = openPositions.reduce(
      (sum, item) => sum + positionPnl(item, executionPrice, state.config.contractSize),
      0,
    );
    return { balance, equity: balance + floatingPL, floatingPL, openPositions, history: [...state.history, closed] };
  }),

  markToMarket: (price) => set((state) => {
    if (!Number.isFinite(price)) return state;
    const floatingPL = state.openPositions.reduce(
      (sum, position) => sum + positionPnl(position, price, state.config.contractSize),
      0,
    );
    return { floatingPL, equity: state.balance + floatingPL };
  }),

  reset: () => set((state) => resetState(state.config)),
}));
