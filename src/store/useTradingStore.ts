import { create } from 'zustand';
import type { ManualTrade, TradeSide, TradingConfig } from '../types';
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

export const useTradingStore = create<TradingState>((set, get) => ({
  config: DEFAULT_CONFIG,
  ...resetState(DEFAULT_CONFIG),

  configureAndReset: (partial) => set((state) => {
    const config = { ...state.config, ...partial };
    return { config, ...resetState(config) };
  }),

  placeOrder: (side, quantity) => {
    const market = useMarketStore.getState();
    const state = get();
    if (market.mode !== 'replay') return '請先切換到「歷史重播」模式再進行模擬交易。';
    if (!Number.isFinite(quantity) || quantity <= 0) return '交易數量必須大於 0。';
    const bar = market.quotes[market.currentIndex];
    if (!bar) return '目前沒有可交易的歷史價格。';

    const { contractSize, leverage } = state.config;
    const usedMargin = state.openPositions.reduce(
      (sum, position) => sum + (position.entryPrice * position.quantity * contractSize) / leverage,
      0,
    );
    const newMargin = (bar.close * quantity * contractSize) / leverage;
    if (usedMargin + newMargin > state.equity) {
      return `模擬保證金不足，需要 ${(usedMargin + newMargin).toFixed(0)}，目前權益 ${state.equity.toFixed(0)}。`;
    }

    const position: ManualTrade = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      side,
      entryTime: bar.time,
      entryPrice: bar.close,
      quantity,
      status: 'OPEN',
    };
    set((current) => ({ openPositions: [...current.openPositions, position] }));
    return null;
  },

  closePosition: (id, reason = 'manual') => set((state) => {
    const market = useMarketStore.getState();
    const bar = market.quotes[market.currentIndex];
    const position = state.openPositions.find((item) => item.id === id);
    if (!position || !bar) return state;

    const pnl = positionPnl(position, bar.close, state.config.contractSize);
    const closed: ManualTrade = {
      ...position,
      closeTime: bar.time,
      closePrice: bar.close,
      pnl,
      status: 'CLOSED',
      reason,
    };
    const balance = state.balance + pnl;
    const openPositions = state.openPositions.filter((item) => item.id !== id);
    const floatingPL = openPositions.reduce(
      (sum, item) => sum + positionPnl(item, bar.close, state.config.contractSize),
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
