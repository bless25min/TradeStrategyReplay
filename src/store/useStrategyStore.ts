import { create } from 'zustand';
import type { BarData, ManualTrade, ReplayMode, StrategyBundle, StrategyIndexItem, StrategyMeta, StrategyTrade, TradeSide } from '../types';
import { loadStrategyBundle, loadStrategyCatalog } from '../services/strategyData';

interface StrategyState {
  catalog: StrategyIndexItem[];
  selectedStrategyId: string | null;
  meta: StrategyMeta | null;
  quotes: BarData[];
  trades: StrategyTrade[];
  mode: ReplayMode;
  currentIndex: number;
  isPlaying: boolean;
  speed: number;
  selectedTradeId: string | null;
  loading: boolean;
  error: string | null;

  balance: number;
  equity: number;
  floatingPL: number;
  openManualPositions: ManualTrade[];
  manualTradeHistory: ManualTrade[];

  initialize: () => Promise<void>;
  loadStrategy: (strategyId: string) => Promise<void>;
  setBundle: (bundle: StrategyBundle) => void;
  setMode: (mode: ReplayMode) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setCurrentIndex: (index: number) => void;
  selectTrade: (tradeId: string | null) => void;
  jumpToTrade: (direction: -1 | 1) => void;

  placeManualOrder: (side: TradeSide, quantity: number) => string | null;
  closeManualPosition: (id: number, reason?: ManualTrade['reason']) => void;
  resetManualTrading: () => void;
}

const nearestQuoteIndex = (quotes: BarData[], targetTime: number): number => {
  if (!quotes.length) return 0;
  let low = 0;
  let high = quotes.length - 1;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (Math.abs(quotes[mid].time - targetTime) < Math.abs(quotes[best].time - targetTime)) best = mid;
    if (quotes[mid].time === targetTime) return mid;
    if (quotes[mid].time < targetTime) low = mid + 1;
    else high = mid - 1;
  }
  return best;
};

const accountDefaults = (meta: StrategyMeta | null) => {
  const balance = meta?.initialBalance ?? 10_000;
  return { balance, equity: balance, floatingPL: 0, openManualPositions: [] as ManualTrade[], manualTradeHistory: [] as ManualTrade[] };
};

const calculatePositionPnl = (position: ManualTrade, currentPrice: number, contractSize: number): number => {
  const diff = position.side === 'LONG' ? currentPrice - position.entryPrice : position.entryPrice - currentPrice;
  return diff * position.quantity * contractSize;
};

const recalculateAccount = (state: StrategyState, index: number) => {
  const price = state.quotes[index]?.close;
  if (!Number.isFinite(price)) return { floatingPL: state.floatingPL, equity: state.equity };
  const contractSize = state.meta?.contractSize ?? 100;
  const floatingPL = state.openManualPositions.reduce((sum, position) => sum + calculatePositionPnl(position, price, contractSize), 0);
  return { floatingPL, equity: state.balance + floatingPL };
};

export const useStrategyStore = create<StrategyState>((set, get) => ({
  catalog: [],
  selectedStrategyId: null,
  meta: null,
  quotes: [],
  trades: [],
  mode: 'overview',
  currentIndex: 0,
  isPlaying: false,
  speed: 5,
  selectedTradeId: null,
  loading: true,
  error: null,

  balance: 10_000,
  equity: 10_000,
  floatingPL: 0,
  openManualPositions: [],
  manualTradeHistory: [],

  initialize: async () => {
    set({ loading: true, error: null });
    try {
      const catalog = await loadStrategyCatalog();
      set({ catalog });
      if (catalog.length) await get().loadStrategy(catalog[0].id);
      else set({ loading: false, error: '策略清單目前是空的。' });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : '初始化失敗' });
    }
  },

  loadStrategy: async (strategyId) => {
    set({ loading: true, error: null, isPlaying: false, selectedTradeId: null });
    try {
      const bundle = await loadStrategyBundle(strategyId);
      set({
        selectedStrategyId: strategyId,
        meta: bundle.meta,
        quotes: bundle.quotes,
        trades: bundle.trades,
        currentIndex: Math.max(0, bundle.quotes.length - 1),
        mode: 'overview',
        loading: false,
        ...accountDefaults(bundle.meta),
      });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : '策略載入失敗' });
    }
  },

  setBundle: (bundle) => set({
    selectedStrategyId: bundle.meta.id,
    meta: bundle.meta,
    quotes: bundle.quotes,
    trades: bundle.trades,
    currentIndex: Math.max(0, bundle.quotes.length - 1),
    mode: 'overview',
    isPlaying: false,
    selectedTradeId: null,
    loading: false,
    error: null,
    ...accountDefaults(bundle.meta),
  }),

  setMode: (mode) => set((state) => ({
    mode,
    isPlaying: false,
    currentIndex: mode === 'overview' ? Math.max(0, state.quotes.length - 1) : 0,
    selectedTradeId: null,
    ...accountDefaults(state.meta),
  })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setSpeed: (speed) => set({ speed }),
  setCurrentIndex: (requestedIndex) => set((state) => {
    const currentIndex = Math.min(Math.max(0, requestedIndex), Math.max(0, state.quotes.length - 1));
    return { currentIndex, ...recalculateAccount(state, currentIndex) };
  }),
  selectTrade: (selectedTradeId) => set({ selectedTradeId, isPlaying: false }),

  jumpToTrade: (direction) => {
    const { trades, quotes, currentIndex } = get();
    if (!trades.length || !quotes.length) return;
    const currentTime = quotes[currentIndex]?.time ?? quotes[0].time;
    let trade: StrategyTrade | undefined;
    if (direction > 0) trade = trades.find((item) => item.entryTime > currentTime);
    else trade = [...trades].reverse().find((item) => item.entryTime < currentTime);
    if (!trade) trade = direction > 0 ? trades[0] : trades[trades.length - 1];
    get().setCurrentIndex(nearestQuoteIndex(quotes, trade.entryTime));
    set({ selectedTradeId: trade.tradeId, isPlaying: false });
  },

  placeManualOrder: (side, quantity) => {
    const state = get();
    if (state.mode !== 'replay') return '請先切換到「歷史重播」模式再進行模擬交易。';
    if (!Number.isFinite(quantity) || quantity <= 0) return '交易數量必須大於 0。';
    const bar = state.quotes[state.currentIndex];
    if (!bar) return '目前沒有可交易的歷史價格。';

    const contractSize = state.meta?.contractSize ?? 100;
    const leverage = state.meta?.leverage ?? 500;
    const usedMargin = state.openManualPositions.reduce((sum, position) => sum + (position.entryPrice * position.quantity * contractSize) / leverage, 0);
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
    set((current) => ({ openManualPositions: [...current.openManualPositions, position] }));
    return null;
  },

  closeManualPosition: (id, reason = 'manual') => set((state) => {
    const position = state.openManualPositions.find((item) => item.id === id);
    const bar = state.quotes[state.currentIndex];
    if (!position || !bar) return state;
    const contractSize = state.meta?.contractSize ?? 100;
    const pnl = calculatePositionPnl(position, bar.close, contractSize);
    const closed: ManualTrade = { ...position, closeTime: bar.time, closePrice: bar.close, pnl, status: 'CLOSED', reason };
    const balance = state.balance + pnl;
    const openManualPositions = state.openManualPositions.filter((item) => item.id !== id);
    const floatingPL = openManualPositions.reduce((sum, item) => sum + calculatePositionPnl(item, bar.close, contractSize), 0);
    return {
      balance,
      equity: balance + floatingPL,
      floatingPL,
      openManualPositions,
      manualTradeHistory: [...state.manualTradeHistory, closed],
    };
  }),

  resetManualTrading: () => set((state) => ({ ...accountDefaults(state.meta) })),
}));
