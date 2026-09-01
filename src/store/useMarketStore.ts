import { create } from 'zustand';
import type { BarData, MarketBundle, MarketMeta, ReplayMode } from '../types';

interface MarketState {
  meta: MarketMeta | null;
  quotes: BarData[];
  mode: ReplayMode;
  currentIndex: number;
  isPlaying: boolean;
  speed: number;
  barProgress: number;
  livePrice: number | null;
  setMarket: (bundle: MarketBundle) => void;
  setMode: (mode: ReplayMode) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setCurrentIndex: (index: number) => void;
  setReplayFrame: (index: number, progress: number, livePrice: number) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  meta: null,
  quotes: [],
  mode: 'overview',
  currentIndex: 0,
  isPlaying: false,
  speed: 1,
  barProgress: 1,
  livePrice: null,

  setMarket: ({ meta, quotes }) => set({
    meta,
    quotes,
    mode: 'overview',
    currentIndex: Math.max(0, quotes.length - 1),
    isPlaying: false,
    barProgress: 1,
    livePrice: quotes[quotes.length - 1]?.close ?? null,
  }),

  setMode: (mode) => set((state) => {
    const currentIndex = mode === 'overview' ? Math.max(0, state.quotes.length - 1) : 0;
    const bar = state.quotes[currentIndex];
    return {
      mode,
      isPlaying: false,
      currentIndex,
      barProgress: mode === 'overview' ? 1 : 0,
      livePrice: bar ? (mode === 'overview' ? bar.close : bar.open) : null,
    };
  }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setSpeed: (speed) => set({ speed }),
  setCurrentIndex: (requestedIndex) => set((state) => {
    const currentIndex = Math.min(Math.max(0, requestedIndex), Math.max(0, state.quotes.length - 1));
    const bar = state.quotes[currentIndex];
    return {
      currentIndex,
      barProgress: state.mode === 'replay' ? 0 : 1,
      livePrice: bar ? (state.mode === 'replay' ? bar.open : bar.close) : null,
    };
  }),
  setReplayFrame: (currentIndex, barProgress, livePrice) => set({ currentIndex, barProgress, livePrice }),
}));
