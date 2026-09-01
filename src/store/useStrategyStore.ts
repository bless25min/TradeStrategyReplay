import { create } from 'zustand';
import type { BarData, ReplayMode, StrategyBundle, StrategyIndexItem, StrategyMeta, StrategyTrade } from '../types';
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
  initialize: () => Promise<void>;
  loadStrategy: (strategyId: string) => Promise<void>;
  setBundle: (bundle: StrategyBundle) => void;
  setMode: (mode: ReplayMode) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setCurrentIndex: (index: number) => void;
  selectTrade: (tradeId: string | null) => void;
  jumpToTrade: (direction: -1 | 1) => void;
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
      set({ selectedStrategyId: strategyId, meta: bundle.meta, quotes: bundle.quotes, trades: bundle.trades, currentIndex: Math.max(0, bundle.quotes.length - 1), mode: 'overview', loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : '策略載入失敗' });
    }
  },

  setBundle: (bundle) => set({ selectedStrategyId: bundle.meta.id, meta: bundle.meta, quotes: bundle.quotes, trades: bundle.trades, currentIndex: Math.max(0, bundle.quotes.length - 1), mode: 'overview', isPlaying: false, selectedTradeId: null, loading: false, error: null }),
  setMode: (mode) => set((state) => ({ mode, isPlaying: false, currentIndex: mode === 'overview' ? Math.max(0, state.quotes.length - 1) : 0, selectedTradeId: null })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setSpeed: (speed) => set({ speed }),
  setCurrentIndex: (currentIndex) => set((state) => ({ currentIndex: Math.min(Math.max(0, currentIndex), Math.max(0, state.quotes.length - 1)) })),
  selectTrade: (selectedTradeId) => set({ selectedTradeId, isPlaying: false }),
  jumpToTrade: (direction) => {
    const { trades, quotes, currentIndex } = get();
    if (!trades.length || !quotes.length) return;
    const currentTime = quotes[currentIndex]?.time ?? quotes[0].time;
    let trade: StrategyTrade | undefined;
    if (direction > 0) trade = trades.find((item) => item.entryTime > currentTime);
    else trade = [...trades].reverse().find((item) => item.entryTime < currentTime);
    if (!trade) trade = direction > 0 ? trades[0] : trades[trades.length - 1];
    set({ currentIndex: nearestQuoteIndex(quotes, trade.entryTime), selectedTradeId: trade.tradeId, isPlaying: false });
  },
}));
